import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { McpServerConfig, McpServerStore } from './mcpServerStore';
import { ToolDef, ToolParameterSchema } from '../agents/types';
import { ToolHandler } from '../agents/tools';

const TOOL_PREFIX = 'mcp_';

interface McpToolEntry {
  mcpName: string;
  toolDef: ToolDef;
}

interface ConnectedServer {
  client: Client;
  tools: McpToolEntry[];
}

/**
 * Maneja las conexiones a servidores MCP (stdio) configurados por el
 * usuario: los levanta bajo demanda, convierte sus tools al formato propio
 * de Scorpk (ToolDef/ToolHandler) para que se sumen a las built-in, y no
 * deja que un servidor caído tire abajo el resto.
 */
export class McpClientManager {
  private readonly connections = new Map<string, ConnectedServer>();
  // Conexiones en curso: getTools() se llama de nuevo en cada mensaje/turno
  // (runChat y teamDeps), así que dos corridas casi simultáneas pueden pedir
  // el mismo servidor antes de que la primera termine de conectar — sin
  // esto, cada una lanzaba su propio proceso hijo y la segunda pisaba la
  // referencia de la primera en `connections`, dejándolo huérfano (nunca se
  // vuelve a cerrar). Cachear la promesa en curso hace que la segunda espere
  // a la misma conexión en vez de duplicarla.
  private readonly connecting = new Map<string, Promise<ConnectedServer>>();

  constructor(private readonly store: McpServerStore) {}

  async getTools(): Promise<{ toolDefs: ToolDef[]; handlers: Record<string, ToolHandler> }> {
    const servers = this.store.list().filter((s) => s.enabled);
    const toolDefs: ToolDef[] = [];
    const handlers: Record<string, ToolHandler> = {};
    for (const server of servers) {
      try {
        const connected = await this.ensureConnected(server);
        for (const { toolDef, mcpName } of connected.tools) {
          toolDefs.push(toolDef);
          handlers[toolDef.name] = (args) => this.callTool(server.id, mcpName, args);
        }
      } catch {
        continue;
      }
    }
    return { toolDefs, handlers };
  }

  /** Se reconecta desde cero y devuelve las tools detectadas — para el botón "Detectar herramientas". */
  async detectTools(server: McpServerConfig): Promise<McpToolEntry[]> {
    this.disconnect(server.id);
    const connected = await this.ensureConnected(server);
    return connected.tools;
  }

  disconnect(serverId: string): void {
    const existing = this.connections.get(serverId);
    if (existing) {
      existing.client.close().catch(() => {});
      this.connections.delete(serverId);
    }
  }

  disconnectAll(): void {
    for (const id of this.connections.keys()) this.disconnect(id);
  }

  private async ensureConnected(server: McpServerConfig): Promise<ConnectedServer> {
    const existing = this.connections.get(server.id);
    if (existing) return existing;

    const inFlight = this.connecting.get(server.id);
    if (inFlight) return inFlight;

    const promise = this.connect(server);
    this.connecting.set(server.id, promise);
    try {
      return await promise;
    } finally {
      this.connecting.delete(server.id);
    }
  }

  private buildTransport(server: McpServerConfig): Transport {
    if (server.kind === 'http') {
      if (!server.url) throw new Error(`Servidor MCP "${server.name}": falta la URL.`);
      return new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: server.headers ? { headers: server.headers } : undefined,
      });
    }
    if (server.kind === 'sse') {
      if (!server.url) throw new Error(`Servidor MCP "${server.name}": falta la URL.`);
      return new SSEClientTransport(new URL(server.url), {
        requestInit: server.headers ? { headers: server.headers } : undefined,
      });
    }
    if (!server.command) throw new Error(`Servidor MCP "${server.name}": falta el comando.`);
    return new StdioClientTransport({ command: server.command, args: server.args ?? [] });
  }

  private async connect(server: McpServerConfig): Promise<ConnectedServer> {
    const transport = this.buildTransport(server);
    const client = new Client({ name: 'scorpk', version: '1.0.0' });
    await client.connect(transport);
    const { tools } = await client.listTools();

    const entries: McpToolEntry[] = tools.map((tool) => ({
      mcpName: tool.name,
      toolDef: {
        name: `${TOOL_PREFIX}${server.id}_${tool.name}`,
        description: `[${server.name}] ${tool.description ?? tool.name}`,
        parameters: (tool.inputSchema as unknown as ToolParameterSchema) ?? { type: 'object', properties: {} },
        requiresApproval: true,
      },
    }));

    const connected: ConnectedServer = { client, tools: entries };
    this.connections.set(server.id, connected);
    return connected;
  }

  private async callTool(serverId: string, mcpName: string, args: Record<string, unknown>): Promise<string> {
    const connected = this.connections.get(serverId);
    if (!connected) throw new Error('El servidor MCP no está conectado.');
    const result = await connected.client.callTool({ name: mcpName, arguments: args });
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.map((part) => (part.type === 'text' ? part.text ?? '' : JSON.stringify(part))).join('\n');
    return text || '(sin resultado)';
  }
}
