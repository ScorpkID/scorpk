import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { McpServerConfig } from '../shared/protocol';

export type { McpServerConfig };

const STORE_KEY = 'scorpk.mcpServers';

/** Servidores MCP configurados por el usuario — stdio (comando local), o
 * http/sse (URL remota). */
export class McpServerStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): McpServerConfig[] {
    const raw = this.context.globalState.get<McpServerConfig[]>(STORE_KEY, []);
    // Servidores guardados antes de que existiera `kind` no lo tienen —
    // todos los que había hasta ahora eran stdio.
    return raw.map((s) => (s.kind ? s : { ...s, kind: 'stdio' as const }));
  }

  get(id: string): McpServerConfig | undefined {
    return this.list().find((s) => s.id === id);
  }

  private async save(servers: McpServerConfig[]): Promise<void> {
    await this.context.globalState.update(STORE_KEY, servers);
  }

  async add(input: Omit<McpServerConfig, 'id'>): Promise<McpServerConfig> {
    const server: McpServerConfig = { ...input, id: randomUUID() };
    const servers = this.list();
    servers.push(server);
    await this.save(servers);
    return server;
  }

  async update(server: McpServerConfig): Promise<void> {
    const servers = this.list();
    const idx = servers.findIndex((s) => s.id === server.id);
    if (idx === -1) throw new Error(`Servidor MCP no encontrado: ${server.id}`);
    servers[idx] = server;
    await this.save(servers);
  }

  async remove(id: string): Promise<void> {
    await this.save(this.list().filter((s) => s.id !== id));
  }
}
