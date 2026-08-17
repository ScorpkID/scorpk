import * as vscode from 'vscode';
import { ScorpkViewProvider } from '../webview/ScorpkViewProvider';

/**
 * Ítem persistente en la status bar de VS Code que refleja si Scorpk está
 * trabajando (chat individual o equipo), aunque el panel lateral esté
 * cerrado — así no hace falta tenerlo abierto todo el tiempo para saber si
 * terminó.
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscription: vscode.Disposable;

  constructor(viewProvider: ScorpkViewProvider) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'scorpk.openPanel';
    this.setIdle();
    this.item.show();

    this.subscription = viewProvider.onActivityChange(({ chatRunning, teamRunning }) => {
      if (chatRunning || teamRunning) {
        this.item.text = '$(sync~spin) Scorpk trabajando...';
        this.item.tooltip = 'Scorpk está generando una respuesta — click para abrir el panel.';
      } else {
        this.setIdle();
      }
    });
  }

  private setIdle(): void {
    this.item.text = '$(hubot) Scorpk';
    this.item.tooltip = 'Scorpk — click para abrir el panel.';
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }
}
