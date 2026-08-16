import { FormEvent, useEffect, useState } from 'react';
import { McpServerConfig } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconCheck, IconPlus, IconTrash } from './Icon';

export function McpManager() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string; toolNames: string[] }>>({});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'mcpServers') {
        setServers(message.servers);
      } else if (message.type === 'mcpDetectResult') {
        setResults((prev) => ({ ...prev, [message.id]: { ok: message.ok, message: message.message, toolNames: message.toolNames } }));
      }
    });
    postToExtension({ type: 'listMcpServers' });
    return unsubscribe;
  }, []);

  function toggleEnabled(server: McpServerConfig) {
    postToExtension({ type: 'updateMcpServer', server: { ...server, enabled: !server.enabled } });
  }

  function remove(id: string) {
    postToExtension({ type: 'removeMcpServer', id });
  }

  function detect(id: string) {
    setResults((prev) => ({ ...prev, [id]: { ok: true, message: 'Conectando...', toolNames: [] } }));
    postToExtension({ type: 'detectMcpTools', id });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;
    postToExtension({
      type: 'addMcpServer',
      server: { name: name.trim(), command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [], enabled: true },
    });
    setName('');
    setCommand('');
    setArgs('');
    setOpen(false);
  }

  return (
    <div className="mcp-manager">
      {servers.length === 0 && <p className="muted">Todavía no conectaste ningún servidor MCP.</p>}
      {servers.map((server) => (
        <div key={server.id} className="mcp-item">
          <div className="mcp-item-main">
            <input type="checkbox" checked={server.enabled} onChange={() => toggleEnabled(server)} title="Habilitado" />
            <div>
              <div className="mcp-item-name">{server.name}</div>
              <div className="mcp-item-meta">
                {server.command} {server.args.join(' ')}
              </div>
            </div>
            <span className="toolbar-spacer" />
            <button type="button" className="btn-ghost" onClick={() => detect(server.id)}>
              <IconCheck size={12} />
              Detectar herramientas
            </button>
            <button type="button" className="btn-icon" onClick={() => remove(server.id)} title="Eliminar">
              <IconTrash size={13} />
            </button>
          </div>
          {results[server.id] && (
            <div className={results[server.id].ok ? 'test-ok' : 'test-error'}>
              {results[server.id].message}
              {results[server.id].toolNames.length > 0 && ` (${results[server.id].toolNames.join(', ')})`}
            </div>
          )}
        </div>
      ))}

      {open ? (
        <form className="mcp-form" onSubmit={submit}>
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Filesystem" />
          </label>
          <label>
            Comando
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
          </label>
          <label>
            Argumentos (separados por espacio)
            <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /ruta" />
          </label>
          <div className="form-actions">
            <button type="submit">Agregar</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="new-agent-toggle" onClick={() => setOpen(true)}>
          <IconPlus size={14} />
          Conectar servidor MCP
        </button>
      )}
    </div>
  );
}
