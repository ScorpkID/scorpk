import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { ProviderStore } from '../providers/providerStore';
import { createClient } from '../providers/clientFactory';
import { HUGGINGFACE_ROUTER_BASE_URL, StoredProviderConfig, VSCODE_COPILOT_KEY_SENTINEL } from '../providers/types';
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
  AttachmentRef,
  UsageTotals,
} from '../shared/protocol';
import { ChatMessage } from '../agents/types';
import { allTools, toolHandlers, computeFileChange, FileChange, setLiveEditorPreviewEnabled } from '../agents/tools';
import { runAgent, ApprovalResult } from '../agents/agentRuntime';
import { resolveApproval, permissionModeSystemSuffix } from '../agents/permissionMode';
import { historyToReplayEvents, userMessageId } from '../agents/historyReplay';
import { readProjectInstructions, withProjectInstructions } from '../agents/projectInstructions';
import { listOpenAICompatibleModels, listAnthropicModels, listVscodeCopilotModels } from '../providers/modelLister';
import { TeamStore } from '../teams/teamStore';
import { runTeamSequential, runDirectAgentTurn, TeamRunDeps } from '../teams/teamRuntime';
import { ConversationStore } from '../conversations/conversationStore';
import { TeamConversationStore } from '../teams/teamConversationStore';
import { AuthService } from '../auth/authService';
import { HuggingFaceAuthService } from '../auth/huggingFaceAuthService';
import { CheckpointStore } from '../checkpoints/checkpointStore';
import { SettingsStore } from '../settings/settingsStore';
import { McpServerStore } from '../mcp/mcpServerStore';
import { PromptTemplateStore } from '../settings/promptTemplateStore';
import { McpClientManager } from '../mcp/mcpClientManager';
import { UsageStore } from '../usage/usageStore';

const SYSTEM_PROMPT = `Eres Scorpk, un agente de programación con acceso real al workspace del usuario en Visual Studio Code.
Usa las herramientas disponibles (read_file, list_dir, write_file, edit_file, delete_file, move_file,
search_files, get_diagnostics, run_terminal_command, git_status, git_diff, git_add, git_commit) para leer,
escribir y ejecutar cosas en el proyecto cuando lo necesites, en vez de asumir contenido que no has visto.
Para modificar un archivo que ya existe, preferí siempre edit_file (reemplazo puntual de una porción) en vez de
reescribirlo entero con write_file — reservá write_file para archivos nuevos o cuando el pedido es realmente una
reescritura completa. Si old_string no matchea de forma única, agregá más líneas de contexto y reintentá en vez
de rendirte o reescribir todo el archivo como atajo.
Para encontrar dónde está algo en un repo grande, usá search_files en vez de leer archivos uno por uno con
read_file. Antes de asumir que algo compila o pasa el linter, podés chequear get_diagnostics en vez de asumir.
Si hay una decisión concreta que le corresponde al usuario (elegir entre alternativas, confirmar un enfoque cuando
hay más de uno razonable), usa la herramienta ask_user en vez de preguntar en texto plano — no abuses de ella.
No te quedes en la versión más mínima o genérica de lo que se te pide. Cuando generes una interfaz o cualquier
resultado visual, pensá el espaciado, la tipografía, la jerarquía visual y los estados (hover, foco, vacío, error)
como parte del pedido, no como un extra — el resultado tiene que verse cuidado y terminado, no un esqueleto.
Preferí una implementación completa y bien pensada por sobre la más corta posible, salvo que el usuario pida
explícitamente algo mínimo.
Sé directo y conciso en tus respuestas.`;

// Únicas URLs que el webview puede pedirle a la extensión abrir en el navegador
// (evita que cualquier mensaje inesperado abra una URL arbitraria del lado del host).
const ALLOWED_EXTERNAL_URLS = new Set<string>(['https://aistudio.google.com/apikey']);

export class ScorpkViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'scorpk.panel';

  private view: vscode.WebviewView | undefined;
  private history: ChatMessage[] = [];
  private activeConversationId: string | null;
  private readonly teamHistories = new Map<string, ChatMessage[]>();
  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>();
  // Cuando se aprueba/rechaza un lote de cambios de una (ver "Aprobar todo"
  // en la UI), la decisión de una tool call puede llegar antes de que el
  // loop del agente termine de procesar la anterior y recién ahí pida esta
  // — se guarda acá para aplicarla apenas se pida, en vez de perderse.
  private readonly preApprovedDecisions = new Map<string, boolean>();
  private readonly pendingAskUserAnswers = new Map<string, (answer: string) => void>();
  private running = false;
  private teamRunning = false;
  private currentPlan: 'free' | 'pro' = 'free';
  private activeChatRunController: AbortController | null = null;
  private activeTeamRunController: AbortController | null = null;
  private currentAssistantId: string | null = null;
  private currentAssistantText = '';
  private readonly pendingFileChanges = new Map<string, FileChange>();
  private workspaceFilesCache: { list: string[]; expiresAt: number } | null = null;
  private activeTeamRunId: string | null = null;
  private activeTeamRunEvents: TeamStreamEvent[] = [];
  private pendingEditorMessage: string | null = null;
  private readonly _onActivityChange = new vscode.EventEmitter<{ chatRunning: boolean; teamRunning: boolean }>();
  public readonly onActivityChange = this._onActivityChange.event;
  private readonly mcpClientManager: McpClientManager;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly providerStore: ProviderStore,
    private readonly teamStore: TeamStore,
    private readonly conversationStore: ConversationStore,
    private readonly teamConversationStore: TeamConversationStore,
    private readonly authService: AuthService,
    private readonly hfAuthService: HuggingFaceAuthService,
    private readonly checkpointStore: CheckpointStore,
    private readonly settingsStore: SettingsStore,
    private readonly mcpServerStore: McpServerStore,
    private readonly usageStore: UsageStore,
    private readonly promptTemplateStore: PromptTemplateStore,
  ) {
    this.mcpClientManager = new McpClientManager(mcpServerStore);
    setLiveEditorPreviewEnabled(this.settingsStore.getLiveEditorPreview());
    this.activeConversationId = this.conversationStore.getActiveId();
    if (this.activeConversationId) {
      this.history = this.conversationStore.getHistory(this.activeConversationId) ?? [];
    }
    for (const [agentId, history] of Object.entries(this.teamConversationStore.getAgentHistories())) {
      this.teamHistories.set(agentId, history);
    }
    this.authService.onAuthStateChange((user) => {
      this.currentPlan = user?.plan ?? 'free';
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

  public dispose(): void {
    this.mcpClientManager.disconnectAll();
    this._onActivityChange.dispose();
  }

  private setRunning(value: boolean): void {
    this.running = value;
    this._onActivityChange.fire({ chatRunning: this.running, teamRunning: this.teamRunning });
  }

  private setTeamRunning(value: boolean): void {
    this.teamRunning = value;
    this._onActivityChange.fire({ chatRunning: this.running, teamRunning: this.teamRunning });
  }

  /** Llamado desde los comandos de code action del editor (ver extension.ts)
   * para inyectar una pregunta armada a partir de una selección o un error
   * del editor, sin que el usuario tenga que copiar/pegar al panel. Si el
   * panel de Scorpk nunca se abrió en esta sesión de VS Code, `this.view`
   * todavía no existe (resolveWebviewView es asíncrono) y el postMessage se
   * perdería en silencio — lo dejamos pendiente y se reenvía apenas llegue
   * el primer 'ready' del webview recién creado. */
  public runFromEditor(text: string): void {
    if (!this.view) {
      this.pendingEditorMessage = text;
      return;
    }
    this.postMessage({ type: 'runFromEditor', text });
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
        await this.sendHfAuthState();
        this.postMessage({ type: 'settingsState', liveEditorPreview: this.settingsStore.getLiveEditorPreview() });
        await this.sendUsageState();
        if (this.activeConversationId) {
          this.postMessage({
            type: 'conversationLoaded',
            id: this.activeConversationId,
            events: historyToReplayEvents(this.history),
          });
        }
        if (this.activeTeamRunId) {
          // Mismo espíritu que conversationLoaded arriba, pero para el chat
          // de equipo: antes esto no existía y por eso una corrida en curso
          // (o recién terminada) desaparecía por completo al reconectar el
          // webview, aunque siguiera corriendo o ya hubiera terminado del
          // lado del extension host.
          this.postMessage({ type: 'teamRunLoaded', id: this.activeTeamRunId, events: this.activeTeamRunEvents });
        }
        if (this.pendingEditorMessage) {
          const text = this.pendingEditorMessage;
          this.pendingEditorMessage = null;
          this.postMessage({ type: 'runFromEditor', text });
        }
        // El webview puede haberse recreado desde cero (VS Code lo oculta y
        // vuelve a cargar al navegar a otra vista) mientras una ejecución
        // seguía corriendo del lado del extension host — le avisamos al
        // reconectar para que la UI no se vea "cortada" ni deje el input
        // habilitado como si no hubiera nada en curso.
        this.postMessage({
          type: 'chatRunState',
          running: this.running,
          assistantId: this.currentAssistantId ?? undefined,
          partialText: this.currentAssistantText || undefined,
        });
        this.postMessage({ type: 'teamRunState', running: this.teamRunning });
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
        await this.runChat(message.providerId, message.model, message.text, message.mode, message.attachments);
        break;
      case 'approveTool': {
        const resolver = this.pendingApprovals.get(message.callId);
        if (resolver) {
          resolver(message.approved);
          this.pendingApprovals.delete(message.callId);
        } else {
          this.preApprovedDecisions.set(message.callId, message.approved);
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
        await this.runTeam(message.task, message.mode, message.attachments);
        break;
      case 'sendToAgent':
        await this.sendToAgent(message.agentId, message.text, message.mode, message.attachments);
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
      case 'authSignInWeb': {
        try {
          await vscode.env.openExternal(vscode.Uri.parse(this.authService.beginWebSignIn()));
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
        if (message.scope === 'chat') {
          this.activeChatRunController?.abort();
        } else {
          this.activeTeamRunController?.abort();
        }
        break;
      case 'hfSignIn': {
        try {
          const url = this.hfAuthService.beginSignIn();
          await vscode.env.openExternal(vscode.Uri.parse(url));
        } catch (err: any) {
          this.postMessage({ type: 'authError', message: err?.message ?? String(err) });
        }
        break;
      }
      case 'hfSignOut':
        await this.hfAuthService.signOut();
        await this.sendHfAuthState();
        break;
      case 'connectHuggingFace':
        await this.connectHuggingFace();
        break;
      case 'detectCopilot':
        await this.detectCopilot();
        break;
      case 'openExternalUrl':
        if (ALLOWED_EXTERNAL_URLS.has(message.url)) {
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        break;
      case 'revertToCheckpoint':
        await this.revertToCheckpoint(message.conversationId, message.messageId);
        break;
      case 'setLiveEditorPreview':
        await this.settingsStore.setLiveEditorPreview(message.enabled);
        setLiveEditorPreviewEnabled(message.enabled);
        break;
      case 'searchWorkspaceFiles':
        await this.searchWorkspaceFiles(message.requestId, message.query);
        break;
      case 'getActiveSelection':
        this.sendActiveSelection(message.requestId);
        break;
      case 'listMcpServers':
        this.sendMcpServers();
        break;
      case 'addMcpServer':
        await this.mcpServerStore.add(message.server);
        this.sendMcpServers();
        break;
      case 'updateMcpServer':
        this.mcpClientManager.disconnect(message.server.id);
        await this.mcpServerStore.update(message.server);
        this.sendMcpServers();
        break;
      case 'removeMcpServer':
        this.mcpClientManager.disconnect(message.id);
        await this.mcpServerStore.remove(message.id);
        this.sendMcpServers();
        break;
      case 'detectMcpTools':
        await this.detectMcpTools(message.id);
        break;
      case 'listUsage':
        await this.sendUsageState();
        break;
      case 'resetUsage':
        await this.usageStore.reset(message.providerId);
        await this.sendUsageState();
        break;
      case 'listPromptTemplates':
        this.sendPromptTemplates();
        break;
      case 'addPromptTemplate':
        await this.promptTemplateStore.add(message.template);
        this.sendPromptTemplates();
        break;
      case 'removePromptTemplate':
        await this.promptTemplateStore.remove(message.id);
        this.sendPromptTemplates();
        break;
    }
  }

  private sendPromptTemplates(): void {
    this.postMessage({ type: 'promptTemplates', templates: this.promptTemplateStore.list() });
  }

  private async sendUsageState(): Promise<void> {
    const totals = this.usageStore.list();
    const providers = this.providerStore.list();
    const out: Record<string, UsageTotals & { providerName: string }> = {};
    for (const [providerId, usage] of Object.entries(totals)) {
      const provider = providers.find((p) => p.id === providerId);
      out[providerId] = {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd > 0 ? usage.costUsd : undefined,
        providerName: provider?.name ?? '(proveedor eliminado)',
      };
    }
    this.postMessage({ type: 'usageState', totals: out });
  }

  private async sendAuthState(): Promise<void> {
    const user: AuthUser | null = await this.authService.getUser();
    this.currentPlan = user?.plan ?? 'free';
    this.postMessage({ type: 'authState', user });
  }

  private async sendHfAuthState(): Promise<void> {
    const user = await this.hfAuthService.getUser();
    this.postMessage({ type: 'hfAuthState', user });
  }

  /** Llamado desde extension.ts cuando el URI handler termina el login de HF. */
  public async refreshHfAuthState(): Promise<void> {
    await this.sendHfAuthState();
  }

  private async connectHuggingFace(): Promise<void> {
    const token = await this.hfAuthService.getValidAccessToken();
    if (!token) {
      // Todavía no se logueó con HF acá — arrancamos el mismo flujo de login;
      // una vez que vuelva, el usuario puede tocar "Conectar" de nuevo.
      await this.handleMessage({ type: 'hfSignIn' });
      return;
    }
    const existing = this.providerStore.list().find((p) => p.kind === 'huggingface-oauth');
    if (existing) {
      await this.providerStore.update(existing, token);
    } else {
      await this.providerStore.add(
        { name: 'Hugging Face', kind: 'huggingface-oauth', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct' },
        token,
      );
    }
    await this.sendProviders();
  }

  private async detectCopilot(): Promise<void> {
    try {
      const models = await listVscodeCopilotModels();
      if (models.length === 0) {
        this.postMessage({
          type: 'copilotDetectResult',
          ok: false,
          message: 'No se encontró ningún modelo de Copilot. ¿Tenés la extensión de GitHub Copilot activa?',
        });
        return;
      }
      const existing = this.providerStore.list().find((p) => p.kind === 'vscode-copilot');
      const defaultModel = models[0].id;
      if (existing) {
        await this.providerStore.update({ ...existing, defaultModel }, VSCODE_COPILOT_KEY_SENTINEL);
      } else {
        await this.providerStore.add(
          { name: 'GitHub Copilot', kind: 'vscode-copilot', defaultModel },
          VSCODE_COPILOT_KEY_SENTINEL,
        );
      }
      await this.sendProviders();
      this.postMessage({ type: 'copilotDetectResult', ok: true, message: `Copilot conectado (${models.length} modelo(s) disponible(s)).` });
    } catch (err: any) {
      this.postMessage({ type: 'copilotDetectResult', ok: false, message: err?.message ?? String(err) });
    }
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

  private async teamDeps(mode: PermissionMode, signal: AbortSignal): Promise<TeamRunDeps> {
    const mcp = this.currentPlan === 'pro' ? await this.mcpClientManager.getTools() : { toolDefs: [], handlers: {} };
    return {
      getAgentClient: (agent) => this.getAgentClient(agent),
      tools: [...allTools, ...mcp.toolDefs],
      toolHandlers: { ...toolHandlers, ...mcp.handlers },
      requestApproval: (_agentId, call) => resolveApproval(mode, call.name, () => this.requestApproval(call.id, signal)),
      askUser: (_agentId, callId) => this.askUser(callId, signal),
      mode,
      signal,
      projectInstructions: await readProjectInstructions(),
    };
  }

  private async runTeam(task: string, mode: PermissionMode, attachments?: AttachmentRef[]): Promise<void> {
    if (this.teamRunning) {
      this.postMessage({ type: 'error', message: 'Ya hay una tarea de equipo en curso.' });
      return;
    }
    if (this.currentPlan !== 'pro') {
      this.postMessage({ type: 'error', message: 'Modo equipo es parte de Scorpk Pro. Mirá los planes en scorpk.tech/pricing.' });
      return;
    }
    if (attachments && attachments.length > 0) {
      const composed = await this.composeWithAttachments(task, attachments);
      if (composed === undefined) {
        this.postMessage({ type: 'error', message: 'El contenido adjunto supera el límite de 60 KB — sacá algún archivo.' });
        return;
      }
      task = composed;
    }
    const agents = this.teamStore.list().filter((a) => a.enabled);
    const events: TeamStreamEvent[] = [];
    const runId = await this.teamConversationStore.saveRun(task, events);
    this.activeTeamRunId = runId;
    this.activeTeamRunEvents = events;
    this.sendTeamRuns();
    this.setTeamRunning(true);
    const controller = new AbortController();
    this.activeTeamRunController = controller;
    try {
      const deps = await this.teamDeps(mode, controller.signal);
      for await (const ev of runTeamSequential(task, agents, deps)) {
        const decorated = await this.decorateTeamEvent(ev);
        events.push(decorated);
        this.postMessage({ type: 'teamEvent', event: decorated });
        if (isTeamCheckpoint(decorated)) {
          await this.teamConversationStore.updateRunEvents(runId, events);
          this.sendTeamRuns();
        }
      }
    } finally {
      this.setTeamRunning(false);
      this.activeTeamRunController = null;
      await this.teamConversationStore.updateRunEvents(runId, events);
      this.sendTeamRuns();
    }
  }

  private async sendToAgent(agentId: string, text: string, mode: PermissionMode, attachments?: AttachmentRef[]): Promise<void> {
    if (this.teamRunning) {
      this.postMessage({ type: 'error', message: 'Ya hay una tarea de equipo en curso.' });
      return;
    }
    if (this.currentPlan !== 'pro') {
      this.postMessage({ type: 'error', message: 'Modo equipo es parte de Scorpk Pro. Mirá los planes en scorpk.tech/pricing.' });
      return;
    }
    const agent = this.teamStore.get(agentId);
    if (!agent) {
      this.postMessage({ type: 'error', message: 'Agente no encontrado.' });
      return;
    }
    if (attachments && attachments.length > 0) {
      const composed = await this.composeWithAttachments(text, attachments);
      if (composed === undefined) {
        this.postMessage({ type: 'error', message: 'El contenido adjunto supera el límite de 60 KB — sacá algún archivo.' });
        return;
      }
      text = composed;
    }
    if (!this.teamHistories.has(agentId)) {
      this.teamHistories.set(agentId, []);
    }
    const history = this.teamHistories.get(agentId)!;

    this.setTeamRunning(true);
    const controller = new AbortController();
    this.activeTeamRunController = controller;
    this.activeTeamRunId = `direct_${agentId}`;
    const runEvents: TeamStreamEvent[] = [];
    this.activeTeamRunEvents = runEvents;
    try {
      const deps = await this.teamDeps(mode, controller.signal);
      for await (const ev of runDirectAgentTurn(agent, text, history, deps)) {
        const decorated = await this.decorateTeamEvent(ev);
        runEvents.push(decorated);
        this.postMessage({ type: 'teamEvent', event: decorated });
        if (isTeamCheckpoint(ev)) {
          await this.persistAgentHistories();
        }
      }
    } finally {
      this.setTeamRunning(false);
      this.activeTeamRunController = null;
      await this.persistAgentHistories();
    }
  }

  private async decorateTeamEvent(ev: TeamStreamEvent): Promise<TeamStreamEvent> {
    if (ev.kind === 'agent-tool-call') {
      const change = await computeFileChange(ev.name, ev.args);
      if (change) {
        this.pendingFileChanges.set(ev.callId, change);
        return { ...ev, diff: change.diff };
      }
    } else if (ev.kind === 'agent-tool-result' || ev.kind === 'agent-tool-rejected') {
      // La vista en vivo ahora pasa dentro del propio handler de write_file/
      // edit_file (así se ve exactamente igual desde chat, equipo o un
      // revert) — acá solo queda limpiar el pendiente.
      this.pendingFileChanges.delete(ev.callId);
    } else if (ev.kind === 'agent-usage') {
      const agent = this.teamStore.get(ev.agentId);
      if (agent?.providerId) {
        await this.usageStore.recordUsage(agent.providerId, agent.model, ev.inputTokens, ev.outputTokens);
        await this.sendUsageState();
      }
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
            : provider.kind === 'vscode-copilot'
              ? await listVscodeCopilotModels()
              : await listOpenAICompatibleModels(
                  provider.kind === 'huggingface-oauth' ? HUGGINGFACE_ROUTER_BASE_URL : provider.baseUrl ?? '',
                  apiKey,
                );
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

  private async runChat(
    providerId: string,
    model: string,
    text: string,
    mode: PermissionMode,
    attachments?: AttachmentRef[],
  ): Promise<void> {
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

    let composedText = text;
    if (attachments && attachments.length > 0) {
      const composed = await this.composeWithAttachments(text, attachments);
      if (composed === undefined) {
        this.postMessage({ type: 'error', message: 'El contenido adjunto supera el límite de 60 KB — sacá algún archivo.' });
        return;
      }
      composedText = composed;
    }

    if (!this.activeConversationId) {
      this.activeConversationId = await this.conversationStore.create(providerId, model);
      this.history = [];
      this.sendConversations();
    }

    this.setRunning(true);
    const userMsgId = userMessageId(this.history.length);
    this.postMessage({ type: 'chatEvent', event: { kind: 'user-message', id: userMsgId, text } });
    this.history.push({ role: 'user', content: composedText });
    await this.persistActiveConversation(providerId, model);

    const client = createClient(provider, apiKey);
    const assistantId = randomUUID();
    const controller = new AbortController();
    this.activeChatRunController = controller;
    this.currentAssistantId = assistantId;
    this.currentAssistantText = '';
    let cancelled = false;

    try {
      const projectInstructions = await readProjectInstructions();
      const mcp = this.currentPlan === 'pro' ? await this.mcpClientManager.getTools() : { toolDefs: [], handlers: {} };
      const gen = runAgent({
        client,
        model,
        system: withProjectInstructions(SYSTEM_PROMPT, projectInstructions) + permissionModeSystemSuffix(mode),
        history: this.history,
        tools: [...allTools, ...mcp.toolDefs],
        toolHandlers: { ...toolHandlers, ...mcp.handlers },
        requestApproval: (call): Promise<ApprovalResult> =>
          resolveApproval(mode, call.name, () => this.requestApproval(call.id, controller.signal)),
        askUser: (callId) => this.askUser(callId, controller.signal),
        signal: controller.signal,
      });

      for await (const ev of gen) {
        if (ev.type === 'text-delta') {
          this.currentAssistantText += ev.textDelta;
          this.postMessage({
            type: 'chatEvent',
            event: { kind: 'assistant-delta', id: assistantId, textDelta: ev.textDelta },
          });
        } else if (ev.type === 'tool-call') {
          const change = await computeFileChange(ev.call.name, ev.call.arguments);
          if (change) this.pendingFileChanges.set(ev.call.id, change);
          this.postMessage({
            type: 'chatEvent',
            event: {
              kind: 'tool-call',
              callId: ev.call.id,
              name: ev.call.name,
              args: ev.call.arguments,
              needsApproval: ev.needsApproval,
              diff: change?.diff,
            },
          });
        } else if (ev.type === 'tool-result') {
          this.postMessage({
            type: 'chatEvent',
            event: { kind: 'tool-result', callId: ev.callId, result: ev.result, isError: ev.isError },
          });
          await this.applyFileChangeSideEffects(ev.callId, ev.isError, this.activeConversationId!, userMsgId);
          await this.persistActiveConversation(providerId, model);
        } else if (ev.type === 'tool-rejected') {
          this.pendingFileChanges.delete(ev.callId);
          this.postMessage({ type: 'chatEvent', event: { kind: 'tool-rejected', callId: ev.callId, reason: ev.reason } });
          await this.persistActiveConversation(providerId, model);
        } else if (ev.type === 'usage') {
          await this.usageStore.recordUsage(providerId, model, ev.inputTokens, ev.outputTokens);
          await this.conversationStore.addUsage(this.activeConversationId!, ev.inputTokens, ev.outputTokens);
          await this.sendUsageState();
          this.sendConversations();
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
      this.setRunning(false);
      this.activeChatRunController = null;
      this.currentAssistantId = null;
      this.currentAssistantText = '';
      await this.persistActiveConversation(providerId, model);
    }
  }

  /** Antepone el contenido de cada adjunto al texto del usuario, como bloque
   * delimitado — undefined si el total supera el límite (el llamador debe
   * avisarle al usuario en vez de truncar en silencio). */
  private async composeWithAttachments(text: string, attachments: AttachmentRef[]): Promise<string | undefined> {
    const MAX_BYTES = 60000;
    const folder = vscode.workspace.workspaceFolders?.[0];
    const blocks: string[] = [];
    let totalBytes = 0;
    for (const att of attachments) {
      let content = '';
      if (folder) {
        try {
          const uri = vscode.Uri.joinPath(folder.uri, att.path);
          const bytes = await vscode.workspace.fs.readFile(uri);
          content = Buffer.from(bytes).toString('utf8');
        } catch {
          content = '(no se pudo leer este archivo)';
        }
      }
      totalBytes += content.length;
      if (totalBytes > MAX_BYTES) return undefined;
      blocks.push(`[Adjunto: ${att.path}]\n\`\`\`\n${content}\n\`\`\``);
    }
    return blocks.join('\n\n') + '\n\n' + text;
  }

  private async searchWorkspaceFiles(requestId: string, query: string): Promise<void> {
    if (!this.workspaceFilesCache || Date.now() > this.workspaceFilesCache.expiresAt) {
      const uris = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,dist,out,.next,build}/**', 2000);
      const list = uris.map((u) => vscode.workspace.asRelativePath(u, false));
      this.workspaceFilesCache = { list, expiresAt: Date.now() + 30000 };
    }
    const q = query.trim().toLowerCase();
    const filtered = q ? this.workspaceFilesCache.list.filter((p) => p.toLowerCase().includes(q)) : this.workspaceFilesCache.list;
    this.postMessage({ type: 'searchWorkspaceFilesResult', requestId, paths: filtered.slice(0, 30) });
  }

  private sendActiveSelection(requestId: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      this.postMessage({ type: 'activeSelectionResult', requestId, selection: null });
      return;
    }
    const text = editor.document.getText(editor.selection);
    const path = vscode.workspace.asRelativePath(editor.document.uri, false);
    this.postMessage({
      type: 'activeSelectionResult',
      requestId,
      selection: { path, text, startLine: editor.selection.start.line + 1, endLine: editor.selection.end.line + 1 },
    });
  }

  private sendMcpServers(): void {
    this.postMessage({ type: 'mcpServers', servers: this.mcpServerStore.list() });
  }

  private async detectMcpTools(id: string): Promise<void> {
    const server = this.mcpServerStore.get(id);
    if (!server) {
      this.postMessage({ type: 'mcpDetectResult', id, ok: false, message: 'Servidor no encontrado.', toolNames: [] });
      return;
    }
    try {
      const tools = await this.mcpClientManager.detectTools(server);
      this.postMessage({
        type: 'mcpDetectResult',
        id,
        ok: true,
        message: `Se encontraron ${tools.length} herramienta(s).`,
        toolNames: tools.map((t) => t.mcpName),
      });
    } catch (err: any) {
      this.postMessage({ type: 'mcpDetectResult', id, ok: false, message: err?.message ?? String(err), toolNames: [] });
    }
  }

  private async persistActiveConversation(providerId: string, model: string): Promise<void> {
    if (!this.activeConversationId) return;
    await this.conversationStore.saveTurn(this.activeConversationId, providerId, model, this.history);
    this.sendConversations();
  }

  /** Después de que un write_file/edit_file/delete_file se ejecuta con éxito:
   * guarda el checkpoint, si todavía no había uno para ese archivo en este
   * mensaje. La vista en vivo ya pasó dentro del propio handler. */
  private async applyFileChangeSideEffects(
    callId: string,
    isError: boolean,
    conversationId: string,
    userMsgId: string,
  ): Promise<void> {
    const change = this.pendingFileChanges.get(callId);
    this.pendingFileChanges.delete(callId);
    if (!change || isError) return;

    if (change.kind === 'move' && change.movedFrom) {
      // El origen tenía contenido antes (revertir = volver a escribirlo ahí) y
      // el destino no existía (revertir = borrarlo).
      await this.checkpointStore.captureIfAbsent(conversationId, userMsgId, change.movedFrom, change.before);
      await this.checkpointStore.captureIfAbsent(conversationId, userMsgId, change.path, null);
      return;
    }

    await this.checkpointStore.captureIfAbsent(
      conversationId,
      userMsgId,
      change.path,
      change.existedBefore ? change.before : null,
    );
  }

  private async revertToCheckpoint(conversationId: string, messageId: string): Promise<void> {
    const files = this.checkpointStore.getCheckpoint(conversationId, messageId);
    if (!files || Object.keys(files).length === 0) {
      this.postMessage({ type: 'error', message: 'Ese mensaje no tocó ningún archivo — no hay nada para revertir.' });
      return;
    }

    const confirmed = await vscode.window.showWarningMessage(
      `Esto va a devolver ${Object.keys(files).length} archivo(s) a como estaban antes de ese mensaje, y va a borrar ` +
        'los mensajes posteriores de esta conversación. ¿Confirmás?',
      { modal: true },
      'Revertir',
    );
    if (confirmed !== 'Revertir') return;

    for (const [relPath, before] of Object.entries(files)) {
      try {
        if (before === null) {
          await toolHandlers.delete_file({ path: relPath });
        } else {
          await toolHandlers.write_file({ path: relPath, content: before });
        }
      } catch (err: any) {
        this.postMessage({ type: 'error', message: `No se pudo revertir ${relPath}: ${err?.message ?? err}` });
      }
    }

    const match = /^msg_(\d+)$/.exec(messageId);
    const cutIndex = match ? Number(match[1]) : undefined;
    if (cutIndex === undefined) return;

    // Los archivos ya se revirtieron pase lo que pase arriba — el modal le
    // prometió al usuario que también se iban a borrar los mensajes
    // posteriores, así que eso tiene que pasar para esta conversación sea
    // o no la que está activa ahora mismo (antes solo pasaba si coincidía
    // con this.activeConversationId, dejando el chat desincronizado de los
    // archivos si el usuario había cambiado de conversación mientras
    // esperaba la confirmación del modal).
    const isActive = conversationId === this.activeConversationId;
    const summary = this.conversationStore.list().find((c) => c.id === conversationId);
    if (isActive) {
      this.history = this.history.slice(0, cutIndex);
      if (summary) {
        await this.persistActiveConversation(summary.providerId, summary.model);
      }
      this.postMessage({ type: 'conversationLoaded', id: conversationId, events: historyToReplayEvents(this.history) });
    } else if (summary) {
      const history = (this.conversationStore.getHistory(conversationId) ?? []).slice(0, cutIndex);
      await this.conversationStore.saveTurn(conversationId, summary.providerId, summary.model, history);
      this.sendConversations();
    }
  }

  private requestApproval(callId: string, signal?: AbortSignal): Promise<boolean> {
    const preDecided = this.preApprovedDecisions.get(callId);
    if (preDecided !== undefined) {
      this.preApprovedDecisions.delete(callId);
      return Promise.resolve(preDecided);
    }
    return new Promise((resolve) => {
      this.pendingApprovals.set(callId, resolve);
      // Si el usuario cancela la ejecución mientras hay una aprobación
      // pendiente, no queremos dejar esa promesa (y por lo tanto el loop del
      // agente) colgada para siempre esperando una respuesta que ya no va a
      // llegar por la UI.
      signal?.addEventListener(
        'abort',
        () => {
          if (this.pendingApprovals.delete(callId)) resolve(false);
        },
        { once: true },
      );
    });
  }

  private askUser(callId: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve) => {
      this.pendingAskUserAnswers.set(callId, resolve);
      signal?.addEventListener(
        'abort',
        () => {
          if (this.pendingAskUserAnswers.delete(callId)) resolve('(cancelado)');
        },
        { once: true },
      );
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
