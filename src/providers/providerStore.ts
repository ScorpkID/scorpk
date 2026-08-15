import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { StoredProviderConfig } from './types';

const PROVIDERS_KEY = 'scorpk.providers';
const secretKeyFor = (id: string) => `scorpk.provider.${id}.apiKey`;

export class ProviderStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): StoredProviderConfig[] {
    return this.context.globalState.get<StoredProviderConfig[]>(PROVIDERS_KEY, []);
  }

  get(id: string): StoredProviderConfig | undefined {
    return this.list().find((p) => p.id === id);
  }

  private async save(providers: StoredProviderConfig[]): Promise<void> {
    await this.context.globalState.update(PROVIDERS_KEY, providers);
  }

  async add(input: Omit<StoredProviderConfig, 'id'>, apiKey: string): Promise<StoredProviderConfig> {
    const provider: StoredProviderConfig = { ...input, id: randomUUID() };
    const providers = this.list();
    providers.push(provider);
    await this.save(providers);
    if (apiKey) {
      await this.context.secrets.store(secretKeyFor(provider.id), apiKey);
    }
    return provider;
  }

  async update(provider: StoredProviderConfig, apiKey?: string): Promise<void> {
    const providers = this.list();
    const idx = providers.findIndex((p) => p.id === provider.id);
    if (idx === -1) {
      throw new Error(`Proveedor no encontrado: ${provider.id}`);
    }
    providers[idx] = provider;
    await this.save(providers);
    if (apiKey) {
      await this.context.secrets.store(secretKeyFor(provider.id), apiKey);
    }
  }

  async remove(id: string): Promise<void> {
    const providers = this.list().filter((p) => p.id !== id);
    await this.save(providers);
    await this.context.secrets.delete(secretKeyFor(id));
  }

  async getApiKey(id: string): Promise<string | undefined> {
    return this.context.secrets.get(secretKeyFor(id));
  }

  async hasApiKey(id: string): Promise<boolean> {
    const key = await this.getApiKey(id);
    return !!key;
  }
}
