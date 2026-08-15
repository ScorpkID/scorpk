import * as vscode from 'vscode';
import { ProviderStore } from './providers/providerStore';
import { TeamStore } from './teams/teamStore';
import { ConversationStore } from './conversations/conversationStore';
import { TeamConversationStore } from './teams/teamConversationStore';
import { AuthService } from './auth/authService';
import { ScorpkViewProvider } from './webview/ScorpkViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const providerStore = new ProviderStore(context);
  const teamStore = new TeamStore(context);
  const conversationStore = new ConversationStore(context);
  const teamConversationStore = new TeamConversationStore(context);
  const authService = new AuthService(context);
  const viewProvider = new ScorpkViewProvider(
    context.extensionUri,
    providerStore,
    teamStore,
    conversationStore,
    teamConversationStore,
    authService,
  );

  context.subscriptions.push(
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
        authService.completeOAuthSignIn(code).catch((err: any) => {
          vscode.window.showErrorMessage(`Scorpk: no se pudo completar el login (${err?.message ?? err}).`);
        });
      },
    }),
  );
}

export function deactivate(): void {}
