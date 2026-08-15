import { ProviderKind } from '../shared/protocol';

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel?: string;
  editableBaseUrl: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', editableBaseUrl: false },
  { id: 'anthropic', label: 'Anthropic (Claude)', kind: 'anthropic', editableBaseUrl: false },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    editableBaseUrl: false,
  },
  { id: 'cerebras', label: 'Cerebras', kind: 'openai-compatible', baseUrl: 'https://api.cerebras.ai/v1', editableBaseUrl: false },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    kind: 'openai-compatible',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    editableBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    editableBaseUrl: false,
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    kind: 'openai-compatible',
    baseUrl: 'https://api.moonshot.ai/v1',
    editableBaseUrl: true,
  },
  { id: 'deepseek', label: 'DeepSeek', kind: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', editableBaseUrl: false },
  {
    id: 'omniroute',
    label: 'OmniRoute',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:20128/v1',
    editableBaseUrl: false,
  },
  { id: 'custom', label: 'Otro (compatible con OpenAI)', kind: 'openai-compatible', baseUrl: '', editableBaseUrl: true },
];
