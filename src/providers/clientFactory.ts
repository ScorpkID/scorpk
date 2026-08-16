import { HUGGINGFACE_ROUTER_BASE_URL, StoredProviderConfig } from './types';
import { LLMClient } from './llmClient';
import { OpenAICompatibleClient } from './openAICompatibleClient';
import { AnthropicClient } from './anthropicClient';
import { VscodeLmClient } from './vscodeLmClient';

export function createClient(provider: StoredProviderConfig, apiKey: string): LLMClient {
  if (provider.kind === 'anthropic') {
    return new AnthropicClient(apiKey);
  }
  if (provider.kind === 'vscode-copilot') {
    return new VscodeLmClient();
  }
  const baseUrl = provider.kind === 'huggingface-oauth' ? HUGGINGFACE_ROUTER_BASE_URL : provider.baseUrl;
  if (!baseUrl) {
    throw new Error(`El proveedor "${provider.name}" no tiene baseUrl configurada.`);
  }
  return new OpenAICompatibleClient(baseUrl, apiKey);
}
