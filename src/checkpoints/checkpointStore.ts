import * as vscode from 'vscode';

interface CheckpointEntry {
  messageId: string;
  timestamp: number;
  summary: string;
  files: Record<string, string | null>;
}

export interface CheckpointSummary {
  messageId: string;
  timestamp: number;
  summary: string;
  fileCount: number;
}

const STORE_KEY = 'scorpk.checkpoints';
const MAX_BYTES_PER_CONVERSATION = 5 * 1024 * 1024;
const SUMMARY_MAX_LENGTH = 80;

/**
 * Guarda, por conversación y por mensaje de usuario, el contenido "antes" de
 * cada archivo que ese mensaje tocó (null = el archivo no existía, revertir
 * = borrarlo). Solo la primera escritura de un archivo dentro de un mensaje
 * queda guardada — si el mismo mensaje edita el mismo archivo varias veces,
 * lo que importa es el estado previo al mensaje completo. El tope es por
 * tamaño total serializado (no por cantidad de entradas) — un solo archivo
 * grande no debería desplazar a diez chequeados chicos.
 */
export class CheckpointStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private all(): Record<string, CheckpointEntry[]> {
    const raw = this.context.workspaceState.get<Record<string, CheckpointEntry[]>>(STORE_KEY, {});
    // Checkpoints guardados antes de que existiera timestamp/summary no los
    // tienen — se completan con un default en vez de mostrar undefined/NaN.
    for (const entries of Object.values(raw)) {
      for (const e of entries) {
        if (!e.timestamp) e.timestamp = Date.now();
        if (e.summary === undefined) e.summary = '';
      }
    }
    return raw;
  }

  private async saveAll(data: Record<string, CheckpointEntry[]>): Promise<void> {
    await this.context.workspaceState.update(STORE_KEY, data);
  }

  async captureIfAbsent(
    conversationId: string,
    messageId: string,
    relPath: string,
    before: string | null,
    summary?: string,
  ): Promise<void> {
    const data = this.all();
    const entries = data[conversationId] ?? [];
    let entry = entries.find((e) => e.messageId === messageId);
    if (!entry) {
      entry = {
        messageId,
        timestamp: Date.now(),
        summary: (summary ?? '').trim().slice(0, SUMMARY_MAX_LENGTH),
        files: {},
      };
      entries.push(entry);
      while (entries.length > 1 && totalBytes(entries) > MAX_BYTES_PER_CONVERSATION) entries.shift();
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

  listCheckpoints(conversationId: string): CheckpointSummary[] {
    return (this.all()[conversationId] ?? []).map((e) => ({
      messageId: e.messageId,
      timestamp: e.timestamp,
      summary: e.summary,
      fileCount: Object.keys(e.files).length,
    }));
  }

  async removeConversation(conversationId: string): Promise<void> {
    const data = this.all();
    if (!(conversationId in data)) return;
    delete data[conversationId];
    await this.saveAll(data);
  }
}

function totalBytes(entries: CheckpointEntry[]): number {
  return Buffer.byteLength(JSON.stringify(entries), 'utf8');
}
