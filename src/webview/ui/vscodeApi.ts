import { WebviewToExtensionMessage, ExtensionToWebviewMessage, ModelsSource, ModelInfo } from '../../shared/protocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

export function postToExtension(message: WebviewToExtensionMessage): void {
  vscodeApi.postMessage(message);
}

export function onExtensionMessage(handler: (message: ExtensionToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data as ExtensionToWebviewMessage);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

let modelsRequestSeq = 0;
const pendingModelsRequests = new Map<
  string,
  (result: { ok: boolean; models: ModelInfo[]; message?: string }) => void
>();

onExtensionMessage((message) => {
  if (message.type === 'modelsResult') {
    const resolver = pendingModelsRequests.get(message.requestId);
    if (resolver) {
      resolver({ ok: message.ok, models: message.models, message: message.message });
      pendingModelsRequests.delete(message.requestId);
    }
  }
});

export function requestModels(source: ModelsSource): Promise<{ ok: boolean; models: ModelInfo[]; message?: string }> {
  const requestId = `models_${++modelsRequestSeq}_${Date.now()}`;
  return new Promise((resolve) => {
    pendingModelsRequests.set(requestId, resolve);
    postToExtension({ type: 'listModels', requestId, source });
  });
}

let fileRequestSeq = 0;
const pendingFileRequests = new Map<string, (path: string | null) => void>();

onExtensionMessage((message) => {
  if (message.type === 'pickFileResult') {
    const resolver = pendingFileRequests.get(message.requestId);
    if (resolver) {
      resolver(message.path);
      pendingFileRequests.delete(message.requestId);
    }
  }
});

export function requestFilePick(): Promise<string | null> {
  const requestId = `file_${++fileRequestSeq}_${Date.now()}`;
  return new Promise((resolve) => {
    pendingFileRequests.set(requestId, resolve);
    postToExtension({ type: 'pickFile', requestId });
  });
}

let autoModeRequestSeq = 0;
const pendingAutoModeRequests = new Map<string, (confirmed: boolean) => void>();

onExtensionMessage((message) => {
  if (message.type === 'confirmAutoModeResult') {
    const resolver = pendingAutoModeRequests.get(message.requestId);
    if (resolver) {
      resolver(message.confirmed);
      pendingAutoModeRequests.delete(message.requestId);
    }
  }
});

export function requestAutoModeConfirmation(): Promise<boolean> {
  const requestId = `auto_${++autoModeRequestSeq}_${Date.now()}`;
  return new Promise((resolve) => {
    pendingAutoModeRequests.set(requestId, resolve);
    postToExtension({ type: 'confirmAutoMode', requestId });
  });
}
