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
import { ScorpkViewProvider } from './webview/ScorpkViewProvider';

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
  );

  context.subscriptions.push(
    { dispose: () => viewProvider.dispose() },
    vscode.window.registerWebviewViewProvider(ScorpkViewProvider.viewType, viewProvider),
    vscode.commands.registerCommand('scorpk.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.scorpk');
    }),
    vscode.commands.registerCommand('scorpk.newChat', () => {
      viewProvider.newChat();
    }),
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        const code = new URLSearchParams(uri.query).get('code');
        if (!code) return;
        if (uri.path === '/hf-callback') {
          hfAuthService
            .completeSignIn(code)
            .then(() => viewProvider.refreshHfAuthState())
            .catch((err: any) => {
              vscode.window.showErrorMessage(`Scorpk: no se pudo completar el login con Hugging Face (${err?.message ?? err}).`);
            });
          return;
        }
        authService.completeOAuthSignIn(code).catch((err: any) => {
          vscode.window.showErrorMessage(`Scorpk: no se pudo completar el login (${err?.message ?? err}).`);
        });
      },
    }),
  );
}

export function deactivate(): void {}
