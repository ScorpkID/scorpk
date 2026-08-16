import * as vscode from 'vscode';

interface CheckpointEntry {
  messageId: string;
  files: Record<string, string | null>;
}

const STORE_KEY = 'scorpk.checkpoints';
const MAX_PER_CONVERSATION = 10;

/**
 * Guarda, por conversación y por mensaje de usuario, el contenido "antes" de
 * cada archivo que ese mensaje tocó (null = el archivo no existía, revertir
 * = borrarlo). Solo la primera escritura de un archivo dentro de un mensaje
 * queda guardada — si el mismo mensaje edita el mismo archivo varias veces,
 * lo que importa es el estado previo al mensaje completo.
 */
export class CheckpointStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private all(): Record<string, CheckpointEntry[]> {
    return this.context.workspaceState.get<Record<string, CheckpointEntry[]>>(STORE_KEY, {});
  }

  private async saveAll(data: Record<string, CheckpointEntry[]>): Promise<void> {
    await this.context.workspaceState.update(STORE_KEY, data);
  }

  async captureIfAbsent(conversationId: string, messageId: string, relPath: string, before: string | null): Promise<void> {
    const data = this.all();
    const entries = data[conversationId] ?? [];
    let entry = entries.find((e) => e.messageId === messageId);
    if (!entry) {
      entry = { messageId, files: {} };
      entries.push(entry);
      while (entries.length > MAX_PER_CONVERSATION) entries.shift();
    }
    if (!(relPath in entry.files)) {
      entry.files[relPath] = before;
    }
    data[conversationId] = entries;
    await this.saveAll(data);
  }

  getCheckpoint(conversationId: string, messageId: string): Record<string, string | null> | undefined {
    return (this.all()[conversationId] ?? []).find((e) => e.messageId === messageId)?.files;
  }

  async removeConversation(conversationId: string): Promise<void> {
    const data = this.all();
    if (!(conversationId in data)) return;
    delete data[conversationId];
    await this.saveAll(data);
  }
}
