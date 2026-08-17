import * as vscode from 'vscode';
import { ProviderStore } from './providers/providerStore';
import { TeamStore } from './teams/teamStore';
import { ConversationStore } from './conversations/conversationStore';
import { TeamConversationStore } from './teams/teamConversationStore';
import { AuthService } from './auth/authService';
import { HuggingFaceAuthService } from './auth/huggingFaceAuthService';
import { CheckpointStore } from './checkpoints/checkpointStore';
import { SettingsStore } from './settings/settingsStore';
import { McpServerStore } from './mcp/mcpServerStore';
import { UsageStore } from './usage/usageStore';
import { PromptTemplateStore } from './settings/promptTemplateStore';
import { ScorpkViewProvider } from './webview/ScorpkViewProvider';
import {
  ASK_ABOUT_SELECTION_COMMAND,
  FIX_DIAGNOSTIC_COMMAND,
  ScorpkCodeActionProvider,
} from './editor/scorpkCodeActionProvider';
import { StatusBarManager } from './editor/statusBarManager';

export function activate(context: vscode.ExtensionContext): void {
  const providerStore = new ProviderStore(context);
  const teamStore = new TeamStore(context);
  const conversationStore = new ConversationStore(context);
  const teamConversationStore = new TeamConversationStore(context);
  const authService = new AuthService(context);
  const hfAuthService = new HuggingFaceAuthService(context);
  const checkpointStore = new CheckpointStore(context);
  const settingsStore = new SettingsStore(context);
  const mcpServerStore = new McpServerStore(context);
  const usageStore = new UsageStore(context);
  const promptTemplateStore = new PromptTemplateStore(context);
  const viewProvider = new ScorpkViewProvider(
    context.extensionUri,
    providerStore,
    teamStore,
    conversationStore,
    teamConversationStore,
    authService,
    hfAuthService,
    checkpointStore,
    settingsStore,
    mcpServerStore,
    usageStore,
    promptTemplateStore,
  );

  const statusBarManager = new StatusBarManager(viewProvider);

  context.subscriptions.push(
    { dispose: () => viewProvider.dispose() },
    statusBarManager,
    vscode.window.registerWebviewViewProvider(ScorpkViewProvider.viewType, viewProvider),
    vscode.commands.registerCommand('scorpk.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.scorpk');
    }),
    vscode.commands.registerCommand('scorpk.newChat', () => {
      viewProvider.newChat();
    }),
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      new ScorpkCodeActionProvider(),
      ScorpkCodeActionProvider.metadata,
    ),
    vscode.commands.registerCommand(ASK_ABOUT_SELECTION_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) return;
      const text = editor.document.getText(editor.selection);
      const relPath = vscode.workspace.asRelativePath(editor.document.uri, false);
      const startLine = editor.selection.start.line + 1;
      const endLine = editor.selection.end.line + 1;
      const lineLabel = startLine === endLine ? `línea ${startLine}` : `líneas ${startLine}-${endLine}`;
      const message = `Explicame este código de ${relPath} (${lineLabel}):\n\n\`\`\`\n${text}\n\`\`\``;
      await vscode.commands.executeCommand('workbench.view.extension.scorpk');
      viewProvider.runFromEditor(message);
    }),
    vscode.commands.registerCommand(FIX_DIAGNOSTIC_COMMAND, async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
      if (!uri || !diagnostic) return;
      let codeSnippet = '';
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        codeSnippet = doc.getText(diagnostic.range);
      } catch {
        codeSnippet = '';
      }
      const relPath = vscode.workspace.asRelativePath(uri, false);
      const line = diagnostic.range.start.line + 1;
      const codeBlock = codeSnippet ? `\n\nCódigo:\n\`\`\`\n${codeSnippet}\n\`\`\`` : '';
      const message = `Arreglá este error en ${relPath}:${line}:\n\n"${diagnostic.message}"${codeBlock}`;
      await vscode.commands.executeCommand('workbench.view.extension.scorpk');
      viewProvider.runFromEditor(message);
    }),
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        const params = new URLSearchParams(uri.query);
        if (uri.path === '/hf-callback') {
          const code = params.get('code');
          if (!code) return;
          hfAuthService
            .completeSignIn(code)
            .then(() => viewProvider.refreshHfAuthState())
            .catch((err: any) => {
              vscode.window.showErrorMessage(`Scorpk: no se pudo completar el login con Hugging Face (${err?.message ?? err}).`);
            });
          return;
        }
        const handoff = params.get('handoff');
        if (!handoff) return;
        authService.completeWebSignIn(handoff).catch((err: any) => {
          vscode.window.showErrorMessage(`Scorpk: no se pudo completar el login (${err?.message ?? err}).`);
        });
      },
    }),
  );
}

export function deactivate(): void {}
