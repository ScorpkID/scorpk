import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

const STORE_KEY = 'scorpk.mcpServers';

/** Servidores MCP configurados por el usuario (v1: solo stdio — comando local). */
export class McpServerStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): McpServerConfig[] {
    return this.context.globalState.get<McpServerConfig[]>(STORE_KEY, []);
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
