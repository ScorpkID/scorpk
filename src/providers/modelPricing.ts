/**
 * Precios de referencia (USD por 1M de tokens) de las APIs oficiales de cada
 * proveedor, a la fecha en que se escribió esto — no se consultan en vivo,
 * así que pueden estar desactualizados. Por eso solo se usan para dar un
 * estimado aproximado en la UI, nunca un monto exacto. Deliberadamente no
 * incluye modelos de proveedores donde el mismo modelo tiene precios muy
 * distintos según quién lo sirve (Groq, Cerebras, NVIDIA, OpenRouter, Kimi,
 * OmniRoute) — ahí se prefiere no inventar un número en vez de mostrar un
 * estimado engañoso.
 */
interface PricingEntry {
  match: string;
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING_TABLE: PricingEntry[] = [
  { match: 'gpt-4o-mini', inputPer1M: 0.15, outputPer1M: 0.6 },
  { match: 'gpt-4o', inputPer1M: 2.5, outputPer1M: 10 },
  { match: 'gpt-4.1-mini', inputPer1M: 0.4, outputPer1M: 1.6 },
  { match: 'gpt-4.1-nano', inputPer1M: 0.1, outputPer1M: 0.4 },
  { match: 'gpt-4.1', inputPer1M: 2, outputPer1M: 8 },
  { match: 'gpt-3.5-turbo', inputPer1M: 0.5, outputPer1M: 1.5 },
  { match: 'claude-opus-4', inputPer1M: 15, outputPer1M: 75 },
  { match: 'claude-sonnet-4', inputPer1M: 3, outputPer1M: 15 },
  { match: 'claude-3-5-sonnet', inputPer1M: 3, outputPer1M: 15 },
  { match: 'claude-3-5-haiku', inputPer1M: 0.8, outputPer1M: 4 },
  { match: 'claude-3-opus', inputPer1M: 15, outputPer1M: 75 },
  { match: 'claude-3-haiku', inputPer1M: 0.25, outputPer1M: 1.25 },
  { match: 'deepseek-reasoner', inputPer1M: 0.55, outputPer1M: 2.19 },
  { match: 'deepseek-chat', inputPer1M: 0.27, outputPer1M: 1.1 },
  { match: 'gemini-2.0-flash', inputPer1M: 0.1, outputPer1M: 0.4 },
  { match: 'gemini-1.5-pro', inputPer1M: 1.25, outputPer1M: 5 },
  { match: 'gemini-1.5-flash', inputPer1M: 0.075, outputPer1M: 0.3 },
];

/** undefined si no hay un precio de referencia conocido para ese modelo — la UI
 * debe mostrar solo tokens en ese caso, sin inventar un costo. También undefined
 * para 'vscode-copilot': es una suscripción, no se paga por token, así que un
 * "$" ahí sería directamente falso aunque el nombre del modelo (p.ej. "gpt-4o")
 * matchee la tabla de precios de la API paga real. */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  providerKind?: string,
): number | undefined {
  if (providerKind === 'vscode-copilot') return undefined;
  const normalized = model.toLowerCase();
  const entry = PRICING_TABLE.find((e) => normalized.includes(e.match));
  if (!entry) return undefined;
  return (inputTokens / 1_000_000) * entry.inputPer1M + (outputTokens / 1_000_000) * entry.outputPer1M;
}
