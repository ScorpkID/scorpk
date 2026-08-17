import * as vscode from 'vscode';
import { estimateCostUsd } from '../providers/modelPricing';

interface RawUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const USAGE_KEY = 'scorpk.usage.byProvider';

/**
 * Totales de tokens acumulados por proveedor, guardados en globalState (no
 * workspaceState) porque lo que se gasta en la API de un proveedor no
 * depende de en qué carpeta/proyecto estés trabajando.
 */
export class UsageStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private all(): Record<string, RawUsage> {
    return this.context.globalState.get<Record<string, RawUsage>>(USAGE_KEY, {});
  }

  private async saveAll(data: Record<string, RawUsage>): Promise<void> {
    await this.context.globalState.update(USAGE_KEY, data);
  }

  list(): Record<string, RawUsage> {
    return this.all();
  }

  /** costUsd acumula solo la porción de llamadas donde se conoce el precio
   * del modelo — si nunca se conoció el precio, queda en 0 aunque haya
   * tokens registrados (la UI debe tratarlo como "sin dato", no como gratis). */
  async recordUsage(
    providerId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    providerKind?: string,
  ): Promise<void> {
    if (inputTokens <= 0 && outputTokens <= 0) return;
    const data = this.all();
    const current = data[providerId] ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const cost = estimateCostUsd(model, inputTokens, outputTokens, providerKind) ?? 0;
    data[providerId] = {
      inputTokens: current.inputTokens + inputTokens,
      outputTokens: current.outputTokens + outputTokens,
      costUsd: current.costUsd + cost,
    };
    await this.saveAll(data);
  }

  async reset(providerId: string): Promise<void> {
    const data = this.all();
    delete data[providerId];
    await this.saveAll(data);
  }
}
