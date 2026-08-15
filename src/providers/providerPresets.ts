import { ProviderConfig, ProviderKind } from '../shared/protocol';

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel?: string;
  editableBaseUrl: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    editableBaseUrl: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    editableBaseUrl: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    editableBaseUrl: false,
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    kind: 'openai-compatible',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.3-70b',
    editableBaseUrl: false,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    kind: 'openai-compatible',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-405b-instruct',
    editableBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
    editableBaseUrl: false,
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    kind: 'openai-compatible',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'moonshot-v1-8k',
    editableBaseUrl: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    editableBaseUrl: false,
  },
  {
    id: 'omniroute',
    label: 'OmniRoute',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:20128/v1',
    editableBaseUrl: false,
  },
  { id: 'custom', label: 'Otro (compatible con OpenAI)', kind: 'openai-compatible', baseUrl: '', editableBaseUrl: true },
];

/**
 * Sugerencia de modelo para un proveedor ya configurado (por su kind +
 * baseUrl). Es solo un punto de partida razonable — el modelo real puede
 * cambiar con el tiempo, por eso "Cargar modelos" sigue siendo la fuente de
 * verdad. Útil sobre todo al armar el equipo: elegir a mano entre decenas
 * de modelos por cada agente es tedioso, mejor partir de una sugerencia.
 */
export function recommendedModelFor(provider: Pick<ProviderConfig, 'kind' | 'baseUrl'>): string | undefined {
  const preset = PROVIDER_PRESETS.find((p) => p.kind === provider.kind && (p.baseUrl ?? '') === (provider.baseUrl ?? ''));
  return preset?.defaultModel;
}
