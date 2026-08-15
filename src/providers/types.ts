export type ProviderKind = 'openai-compatible' | 'anthropic';

export interface StoredProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel?: string;
}

export const OMNIROUTE_BASE_URL = 'http://localhost:20128/v1';
