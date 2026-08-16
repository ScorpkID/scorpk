import * as vscode from 'vscode';

export const ASK_ABOUT_SELECTION_COMMAND = 'scorpk.askAboutSelection';
export const FIX_DIAGNOSTIC_COMMAND = 'scorpk.fixDiagnostic';

export class ScorpkCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.Empty, vscode.CodeActionKind.QuickFix],
  };

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    if (!range.isEmpty) {
      const askAction = new vscode.CodeAction('Preguntale a Scorpk sobre esta selección', vscode.CodeActionKind.Empty);
      askAction.command = { command: ASK_ABOUT_SELECTION_COMMAND, title: 'Preguntale a Scorpk' };
      actions.push(askAction);
    }

    for (const diagnostic of context.diagnostics) {
      const fixAction = new vscode.CodeAction(
        `Arreglar con Scorpk: ${truncate(diagnostic.message)}`,
        vscode.CodeActionKind.QuickFix,
      );
      fixAction.diagnostics = [diagnostic];
      fixAction.command = {
        command: FIX_DIAGNOSTIC_COMMAND,
        title: 'Arreglar con Scorpk',
        arguments: [document.uri, diagnostic],
      };
      actions.push(fixAction);
    }

    return actions;
  }
}

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}
