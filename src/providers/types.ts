export type ProviderKind = 'openai-compatible' | 'anthropic' | 'huggingface-oauth' | 'vscode-copilot';

export interface StoredProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel?: string;
}

export const OMNIROUTE_BASE_URL = 'http://localhost:20128/v1';

// Router unificado de Hugging Face "Inference Providers" — habla el mismo
// formato que la API de OpenAI, por eso huggingface-oauth reusa
// OpenAICompatibleClient con esta baseUrl fija (no editable por el usuario).
export const HUGGINGFACE_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';

// Sentinel guardado como "apiKey" para el proveedor de Copilot: no hay
// ningún secreto real (la autenticación la maneja VS Code de forma nativa),
// pero reusamos el mismo esquema de SecretStorage para que hasApiKey/getApiKey
// funcionen sin tener que tocar cada call site.
export const VSCODE_COPILOT_KEY_SENTINEL = 'vscode-native';
