import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { ProviderStore } from '../providers/providerStore';
import { createClient } from '../providers/clientFactory';
import { StoredProviderConfig } from '../providers/types';
import {
  ProviderConfig,
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
  ModelsSource,
  ModelInfo,
  AgentDefinition,
  PermissionMode,
  TeamStreamEvent,
  AuthUser,
} from '../shared/protocol';
import { ChatMessage } from '../agents/types';
import { allTools, toolHandlers, buildToolCallDiff } from '../agents/tools';
import { runAgent, ApprovalResult } from '../agents/agentRuntime';
import { resolveApproval, permissionModeSystemSuffix } from '../agents/permissionMode';
import { historyToReplayEvents } from '../agents/historyReplay';
import { listOpenAICompatibleModels, listAnthropicModels } from '../providers/modelLister';
import { TeamStore } from '../teams/teamStore';
import { runTeamSequential, runDirectAgentTurn, TeamRunDeps } from '../teams/teamRuntime';
import { ConversationStore } from '../conversations/conversationStore';
import { TeamConversationStore } from '../teams/teamConversationStore';
import { AuthService } from '../auth/authService';

const SYSTEM_PROMPT = `Eres Scorpk, un agente de programación con acceso real al workspace del usuario en Visual Studio Code.
Usa las herramientas disponibles (read_file, list_dir, write_file, delete_file, run_terminal_command, git_status, git_diff)
para leer, escribir y ejecutar cosas en el proyecto cuando lo necesites, en vez de asumir contenido que no has visto.
Si hay una decisión concreta que le corresponde al usuario (elegir entre alternativas, confirmar un enfoque cuando
hay más de uno razonable), usa la herramienta ask_user en vez de preguntar en texto plano — no abuses de ella.
Sé directo y conciso en tus respuestas.`;

export class ScorpkViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'scorpk.panel';

  private view: vscode.WebviewView | undefined;
  private history: ChatMessage[] = [];
  private activeConversationId: string | null;
  private readonly teamHistories = new Map<string, ChatMessage[]>();
  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>();
  private readonly pendingAskUserAnswers = new Map<string, (answer: string) => void>();
  private running = false;
  private teamRunning = false;
  private activeRunController: AbortController | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly providerStore: ProviderStore,
    private readonly teamStore: TeamStore,
    private readonly conversationStore: ConversationStore,
    private readonly teamConversationStore: TeamConversationStore,
    private readonly authService: AuthService,
  ) {
    this.activeConversationId = this.conversationStore.getActiveId();
    if (this.activeConversationId) {
      this.history = this.conversationStore.getHistory(this.activeConversationId) ?? [];
    }
    for (const [agentId, history] of Object.entries(this.teamConversationStore.getAgentHistories())) {
      this.teamHistories.set(agentId, history);
    }
    this.authService.onAuthStateChange((user) => {
      this.postMessage({ type: 'authState', user });
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      this.handleMessage(message).catch((err) => {
        this.postMessage({ type: 'error', message: err?.message ?? String(err) });
      });
    });
  }

  public newChat(): void {
    this.activeConversationId = null;
    this.history = [];
    void this.conversationStore.setActiveId(null);
    this.sendConversations();
    this.postMessage({ type: 'conversationLoaded', id: null, events: [] });
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.sendProviders();
        this.sendAgents();
        this.sendConversations();
        this.sendTeamRuns();
        await this.sendAuthState();
        if (this.activeConversationId) {
          this.postMessage({
            type: 'conversationLoaded',
            id: this.activeConversationId,
            events: historyToReplayEvents(this.history),
          });
        }
        break;
      case 'listProviders':
        await this.sendProviders();
        break;
      case 'addProvider': {
        await this.providerStore.add(message.provider, message.apiKey);
        await this.sendProviders();
        break;
      }
      case 'updateProvider': {
        const { hasApiKey, ...rest } = message.provider;
        await this.providerStore.update(rest as StoredProviderConfig, message.apiKey);
        await this.sendProviders();
        break;
      }
      case 'removeProvider':
        await this.providerStore.remove(message.id);
        await this.sendProviders();
        break;
      case 'testProvider':
        await this.testProvider(message.id);
        break;
      case 'sendMessage':
        await this.runChat(message.providerId, message.model, message.text, message.mode);
        break;
      case 'approveTool': {
        const resolver = this.pendingApprovals.get(message.callId);
        if (resolver) {
          resolver(message.approved);
          this.pendingApprovals.delete(message.callId);
        }
        break;
      }
      case 'answerQuestion': {
        const resolver = this.pendingAskUserAnswers.get(message.callId);
        if (resolver) {
          resolver(message.answer);
          this.pendingAskUserAnswers.delete(message.callId);
        }
        break;
      }
      case 'listModels':
        await this.listModels(message.requestId, message.source);
        break;
      case 'listAgents':
        this.sendAgents();
        break;
      case 'addAgent':
        await this.teamStore.add(message.agent);
        this.sendAgents();
        break;
      case 'updateAgent':
        await this.teamStore.update(message.agent);
        this.sendAgents();
        break;
      case 'removeAgent':
        await this.teamStore.remove(message.id);
        this.teamHistories.delete(message.id);
        await this.persistAgentHistories();
        this.sendAgents();
        break;
      case 'reorderAgents':
        await this.teamStore.reorder(message.orderedIds);
        this.sendAgents();
        break;
      case 'runTeam':
        await this.runTeam(message.task, message.mode);
        break;
      case 'sendToAgent':
        await this.sendToAgent(message.agentId, message.text, message.mode);
        break;
      case 'resetAgentMemory':
        this.teamHistories.set(message.agentId, []);
        await this.persistAgentHistories();
        break;
      case 'listTeamRuns':
        this.sendTeamRuns();
        break;
      case 'openTeamRun': {
        const events = this.teamConversationStore.getEvents(message.id);
        if (!events) {
          this.postMessage({ type: 'error', message: 'Ejecución de equipo no encontrada.' });
          break;
        }
        this.postMessage({ type: 'teamRunLoaded', id: message.id, events });
        break;
      }
      case 'renameTeamRun':
        await this.teamConversationStore.rename(message.id, message.title);
        this.sendTeamRuns();
        break;
      case 'deleteTeamRun':
        await this.teamConversationStore.remove(message.id);
        this.sendTeamRuns();
        break;
      case 'listConversations':
        this.sendConversations();
        break;
      case 'openConversation':
        await this.openConversation(message.id);
        break;
      case 'newConversation':
        this.newChat();
        break;
      case 'renameConversation':
        await this.conversationStore.rename(message.id, message.title);
        this.sendConversations();
        break;
      case 'deleteConversation':
        await this.conversationStore.remove(message.id);
        if (this.activeConversationId === message.id) {
          this.newChat();
        } else {
          this.sendConversations();
        }
        break;
      case 'pickFile':
        await this.pickFile(message.requestId);
        break;
      case 'authGetState':
        await this.sendAuthState();
        break;
      case 'authSignInWithPassword': {
        const result = await this.authService.signInWithPassword(message.email, message.password);
        if (!result.ok) this.postMessage({ type: 'authError', message: result.message });
        break;
      }
      case 'authSignUp': {
        const result = await this.authService.signUp(message.email, message.password);
        if (!result.ok) {
          this.postMessage({ type: 'authError', message: result.message });
        } else if (result.needsConfirmation) {
          this.postMessage({ type: 'authInfo', message: 'Te enviamos un correo para confirmar tu cuenta.' });
        }
        break;
      }
      case 'authSignInWithOAuth': {
        try {
          const url = await this.authService.beginOAuthSignIn(message.provider);
          await vscode.env.openExternal(vscode.Uri.parse(url));
        } catch (err: any) {
          this.postMessage({ type: 'authError', message: err?.message ?? String(err) });
        }
        break;
      }
      case 'authSignOut':
        await this.authService.signOut();
        break;
      case 'confirmAutoMode': {
        const confirmed = await vscode.window.showWarningMessage(
          'En modo Auto, los agentes aprueban solos la escritura y el borrado de archivos y la ejecución de ' +
            'comandos de terminal, sin pedirte confirmación. ¿Confirmás que querés activarlo?',
          { modal: true },
          'Activar Auto',
        );
        this.postMessage({ type: 'confirmAutoModeResult', requestId: message.requestId, confirmed: confirmed === 'Activar Auto' });
        break;
      }
      case 'cancelRun':
        this.activeRunController?.abort();
        break;
    }
  }

  private async sendAuthState(): Promise<void> {
    const user: AuthUser | null = await this.authService.getUser();
    this.postMessage({ type: 'authState', user });
  }

  private async pickFile(requestId: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      defaultUri: folders?.[0]?.uri,
      openLabel: 'Adjuntar',
    });
    const path = uris && uris.length > 0 ? vscode.workspace.asRelativePath(uris[0], false) : null;
    this.postMessage({ type: 'pickFileResult', requestId, path });
  }

  private sendConversations(): void {
    this.postMessage({
      type: 'conversations',
      conversations: this.conversationStore.list(),
      activeId: this.activeConversationId,
    });
  }

  private async openConversation(id: string): Promise<void> {
    const history = this.conversationStore.getHistory(id);
    if (!history) {
      this.postMessage({ type: 'error', message: 'Conversación no encontrada.' });
      return;
    }
    this.activeConversationId = id;
    this.history = history;
    await this.conversationStore.setActiveId(id);
    this.sendConversations();
    this.postMessage({ type: 'conversationLoaded', id, events: historyToReplayEvents(history) });
  }

  private sendAgents(): void {
    this.postMessage({ type: 'agents', agents: this.teamStore.list() });
  }

  private sendTeamRuns(): void {
    this.postMessage({ type: 'teamRuns', runs: this.teamConversationStore.list() });
  }

  private async persistAgentHistories(): Promise<void> {
    await this.teamConversationStore.saveAgentHistories(Object.fromEntries(this.teamHistories));
  }

  private async getAgentClient(agent: AgentDefinition): Promise<{ client: ReturnType<typeof createClient>; model: string }> {
    if (!agent.providerId) {
      throw new Error('No tiene proveedor asignado.');
    }
    if (!agent.model) {
      throw new Error('No tiene modelo asignado.');
    }
    const provider = this.providerStore.get(agent.providerId);
    if (!provider) {
      throw new Error('El proveedor asignado ya no existe.');
    }
    const apiKey = await this.providerStore.getApiKey(agent.providerId);
    if (!apiKey) {
      throw new Error(`El proveedor "${provider.name}" no tiene API key configurada.`);
    }
    return { client: createClient(provider, apiKey), model: agent.model };
  }

  private teamDeps(mode: PermissionMode, signal: AbortSignal): TeamRunDeps {
    return {
      getAgentClient: (agent) => this.getAgentClient(agent),
      tools: allTools,
      toolHandlers,
      requestApproval: (_agentId, call) => resolveApproval(mode, call.name, () => this.requestApproval(call.id)),
      askUser: (_agentId, callId) => this.askUser(callId),
      mode,
      signal,
    };
  }

  private async runTeam(task: string, mode: PermissionMode): Promise<void> {
    if (this.teamRunning) {
      this.postMessage({ type: 'error', message: 'Ya hay una tarea de equipo en curso.' });
      return;
    }
    const agents = this.teamStore.list().filter((a) => a.enabled);
    const events: TeamStreamEvent[] = [];
    const runId = await this.teamConversationStore.saveRun(task, events);
    this.sendTeamRuns();
    this.teamRunning = true;
    const controller = new AbortController();
    this.activeRunController = controller;
    try {
      for await (const ev of runTeamSequential(task, agents, this.teamDeps(mode, controller.signal))) {
        const decorated = await this.decorateTeamEvent(ev);
        events.push(decorated);
        this.postMessage({ type: 'teamEvent', event: decorated });
        if (isTeamCheckpoint(decorated)) {
          await this.teamConversationStore.updateRunEvents(runId, events);
          this.sendTeamRuns();
        }
      }
    } finally {
      this.teamRunning = false;
      this.activeRunController = null;
      await this.teamConversationStore.updateRunEvents(runId, events);
      this.sendTeamRuns();
    }
  }

  private async sendToAgent(agentId: string, text: string, mode: PermissionMode): Promise<void> {
    if (this.teamRunning) {
      this.postMessage({ type: 'error', message: 'Ya hay una tarea de equipo en curso.' });
      return;
    }
    const agent = this.teamStore.get(agentId);
    if (!agent) {
      this.postMessage({ type: 'error', message: 'Agente no encontrado.' });
      return;
    }
    if (!this.teamHistories.has(agentId)) {
      this.teamHistories.set(agentId, []);
    }
    const history = this.teamHistories.get(agentId)!;

    this.teamRunning = true;
    const controller = new AbortController();
    this.activeRunController = controller;
    try {
      for await (const ev of runDirectAgentTurn(agent, text, history, this.teamDeps(mode, controller.signal))) {
        this.postMessage({ type: 'teamEvent', event: await this.decorateTeamEvent(ev) });
        if (isTeamCheckpoint(ev)) {
          await this.persistAgentHistories();
        }
      }
    } finally {
      this.teamRunning = false;
      this.activeRunController = null;
      await this.persistAgentHistories();
    }
  }

  private async decorateTeamEvent(ev: TeamStreamEvent): Promise<TeamStreamEvent> {
    if (ev.kind === 'agent-tool-call') {
      const diff = await buildToolCallDiff(ev.name, ev.args);
      if (diff) return { ...ev, diff };
    }
    return ev;
  }

  private async listModels(requestId: string, source: ModelsSource): Promise<void> {
    try {
      let models: ModelInfo[];
      if (source.kind === 'saved') {
        const provider = this.providerStore.get(source.providerId);
        if (!provider) throw new Error('Proveedor no encontrado.');
        const apiKey = await this.providerStore.getApiKey(source.providerId);
        if (!apiKey) throw new Error('Este proveedor no tiene API key configurada.');
        models =
          provider.kind === 'anthropic'
            ? await listAnthropicModels(apiKey)
            : await listOpenAICompatibleModels(provider.baseUrl ?? '', apiKey);
      } else {
        if (!source.apiKey) throw new Error('Ingresá la API key para poder cargar los modelos.');
        models =
          source.providerKind === 'anthropic'
            ? await listAnthropicModels(source.apiKey)
            : await listOpenAICompatibleModels(source.baseUrl ?? '', source.apiKey);
      }
      this.postMessage({ type: 'modelsResult', requestId, ok: true, models });
    } catch (err: any) {
      this.postMessage({ type: 'modelsResult', requestId, ok: false, models: [], message: err?.message ?? String(err) });
    }
  }

  private async sendProviders(): Promise<void> {
    const stored = this.providerStore.list();
    const withKeys: ProviderConfig[] = await Promise.all(
      stored.map(async (p) => ({ ...p, hasApiKey: await this.providerStore.hasApiKey(p.id) })),
    );
    this.postMessage({ type: 'providers', providers: withKeys });
  }

  private async testProvider(id: string): Promise<void> {
    const provider = this.providerStore.get(id);
    if (!provider) {
      this.postMessage({ type: 'providerTestResult', id, ok: false, message: 'Proveedor no encontrado.' });
      return;
    }
    const apiKey = await this.providerStore.getApiKey(id);
    if (!apiKey) {
      this.postMessage({ type: 'providerTestResult', id, ok: false, message: 'Falta API key.' });
      return;
    }
    try {
      const client = createClient(provider, apiKey);
      const model = provider.defaultModel || (provider.kind === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini');
      const gen = client.chat({ model, messages: [{ role: 'user', content: 'ping' }] });
      // Consumimos al menos un evento para confirmar que la conexión funciona.
      await gen.next();
      this.postMessage({ type: 'providerTestResult', id, ok: true, message: 'Conexión exitosa.' });
    } catch (err: any) {
      this.postMessage({ type: 'providerTestResult', id, ok: false, message: err?.message ?? String(err) });
    }
  }

  private async runChat(providerId: string, model: string, text: string, mode: PermissionMode): Promise<void> {
    if (this.running) {
      this.postMessage({ type: 'error', message: 'Ya hay un mensaje en curso.' });
      return;
    }
    const provider = this.providerStore.get(providerId);
    if (!provider) {
      this.postMessage({ type: 'error', message: 'Proveedor no encontrado.' });
      return;
    }
    const apiKey = await this.providerStore.getApiKey(providerId);
    if (!apiKey) {
      this.postMessage({ type: 'error', message: 'Este proveedor no tiene API key configurada.' });
      return;
    }

    if (!this.activeConversationId) {
      this.activeConversationId = await this.conversationStore.create(providerId, model);
      this.history = [];
      this.sendConversations();
    }

    this.running = true;
    const userMsgId = randomUUID();
    this.postMessage({ type: 'chatEvent', event: { kind: 'user-message', id: userMsgId, text } });
    this.history.push({ role: 'user', content: text });
    await this.persistActiveConversation(providerId, model);

    const client = createClient(provider, apiKey);
    const assistantId = randomUUID();
    const controller = new AbortController();
    this.activeRunController = controller;
    let cancelled = false;

    try {
      const gen = runAgent({
        client,
        model,
        system: SYSTEM_PROMPT + permissionModeSystemSuffix(mode),
        history: this.history,
        tools: allTools,
        toolHandlers,
        requestApproval: (call): Promise<ApprovalResult> => resolveApproval(mode, call.name, () => this.requestApproval(call.id)),
        askUser: (callId) => this.askUser(callId),
        signal: controller.signal,
      });

      for await (const ev of gen) {
        if (ev.type === 'text-delta') {
          this.postMessage({
            type: 'chatEvent',
            event: { kind: 'assistant-delta', id: assistantId, textDelta: ev.textDelta },
          });
        } else if (ev.type === 'tool-call') {
          const diff = await buildToolCallDiff(ev.call.name, ev.call.arguments);
          this.postMessage({
            type: 'chatEvent',
            event: {
              kind: 'tool-call',
              callId: ev.call.id,
              name: ev.call.name,
              args: ev.call.arguments,
              needsApproval: ev.needsApproval,
              diff,
            },
          });
        } else if (ev.type === 'tool-result') {
          this.postMessage({
            type: 'chatEvent',
            event: { kind: 'tool-result', callId: ev.callId, result: ev.result, isError: ev.isError },
          });
          await this.persistActiveConversation(providerId, model);
        } else if (ev.type === 'tool-rejected') {
          this.postMessage({ type: 'chatEvent', event: { kind: 'tool-rejected', callId: ev.callId, reason: ev.reason } });
          await this.persistActiveConversation(providerId, model);
        } else if (ev.type === 'cancelled') {
          cancelled = true;
          this.postMessage({ type: 'chatEvent', event: { kind: 'run-cancelled' } });
        } else if (ev.type === 'done') {
          this.postMessage({ type: 'chatEvent', event: { kind: 'assistant-done', id: assistantId } });
          await this.persistActiveConversation(providerId, model);
        }
      }

      if (!cancelled) {
        this.postMessage({ type: 'chatEvent', event: { kind: 'run-done' } });
      }
    } catch (err: any) {
      this.postMessage({ type: 'chatEvent', event: { kind: 'run-error', message: err?.message ?? String(err) } });
    } finally {
      this.running = false;
      this.activeRunController = null;
      await this.persistActiveConversation(providerId, model);
    }
  }

  private async persistActiveConversation(providerId: string, model: string): Promise<void> {
    if (!this.activeConversationId) return;
    await this.conversationStore.saveTurn(this.activeConversationId, providerId, model, this.history);
    this.sendConversations();
  }

  private requestApproval(callId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingApprovals.set(callId, resolve);
    });
  }

  private askUser(callId: string): Promise<string> {
    return new Promise((resolve) => {
      this.pendingAskUserAnswers.set(callId, resolve);
    });
  }

  private postMessage(message: ExtensionToWebviewMessage): void {
    this.view?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'logo.png'));
    const nonce = randomUUID().replace(/-/g, '');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Scorpk</title>
</head>
<body>
  <div id="root" data-logo-uri="${logoUri}"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function isTeamCheckpoint(ev: TeamStreamEvent): boolean {
  return (
    ev.kind === 'agent-text-done' ||
    ev.kind === 'agent-tool-result' ||
    ev.kind === 'agent-tool-rejected' ||
    ev.kind === 'agent-done'
  );
}
