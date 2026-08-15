import * as vscode from 'vscode';

const PREFIX = 'scorpk.auth.';

/**
 * @supabase/supabase-js persiste la sesión (tokens) a través de una interfaz
 * de storage tipo localStorage. El extension host no tiene localStorage, así
 * que la respaldamos en SecretStorage — igual que las API keys de proveedores.
 */
export class SecretStorageAdapter {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getItem(key: string): Promise<string | null> {
    return (await this.secrets.get(PREFIX + key)) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.secrets.store(PREFIX + key, value);
  }

  async removeItem(key: string): Promise<void> {
    await this.secrets.delete(PREFIX + key);
  }
}
