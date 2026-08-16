import * as vscode from 'vscode';
import { ModelInfo } from '../shared/protocol';

const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2023-06-01';

export async function listOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, '') + '/models';
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`No se pudo obtener la lista de modelos (${response.status}): ${await safeText(response)}`);
  }
  const json: any = await response.json();
  const data: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  return data
    .map((entry) => toModelInfo(entry))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function listAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch(`${ANTHROPIC_MODELS_URL}?limit=1000`, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
  });
  if (!response.ok) {
    throw new Error(`No se pudo obtener la lista de modelos (${response.status}): ${await safeText(response)}`);
  }
  const json: any = await response.json();
  const data: any[] = Array.isArray(json?.data) ? json.data : [];
  return data
    .map((entry) => ({ id: entry.id, provider: 'anthropic', free: false }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function listVscodeCopilotModels(): Promise<ModelInfo[]> {
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  return models.map((m) => ({ id: m.id, provider: 'copilot', free: true }));
}

function toModelInfo(entry: any): ModelInfo {
  const id: string = entry.id ?? entry.name ?? String(entry);
  const provider: string | undefined = entry.owned_by ?? (id.includes('/') ? id.split('/')[0] : undefined);
  const free = isFree(id, entry.pricing);
  return { id, provider, free };
}

function isFree(id: string, pricing: any): boolean {
  if (id.toLowerCase().endsWith(':free')) return true;
  if (pricing && typeof pricing === 'object') {
    const prompt = parseFloat(pricing.prompt ?? pricing.input ?? '0');
    const completion = parseFloat(pricing.completion ?? pricing.output ?? '0');
    if (!Number.isNaN(prompt) && !Number.isNaN(completion)) {
      return prompt === 0 && completion === 0;
    }
  }
  return false;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
