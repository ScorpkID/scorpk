import * as vscode from 'vscode';

const LIVE_EDITOR_PREVIEW_KEY = 'scorpk.settings.liveEditorPreview';

export class SettingsStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getLiveEditorPreview(): boolean {
    return this.context.globalState.get<boolean>(LIVE_EDITOR_PREVIEW_KEY, true);
  }

  async setLiveEditorPreview(enabled: boolean): Promise<void> {
    await this.context.globalState.update(LIVE_EDITOR_PREVIEW_KEY, enabled);
  }
}
