import { FormEvent, useEffect, useState } from 'react';
import { McpServerConfig, McpTransportKind } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconCheck, IconPlus, IconTrash } from './Icon';

const KIND_LABELS: Record<McpTransportKind, string> = {
  stdio: 'Stdio',
  http: 'HTTP',
  sse: 'SSE',
};

function parseHeaders(text: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function McpManager() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string; toolNames: string[] }>>({});
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<McpTransportKind>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [headersText, setHeadersText] = useState('');

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

  function resetForm() {
    setKind('stdio');
    setName('');
    setCommand('');
    setArgs('');
    setUrl('');
    setHeadersText('');
    setOpen(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (kind === 'stdio') {
      if (!command.trim()) return;
      postToExtension({
        type: 'addMcpServer',
        server: { name: name.trim(), kind, command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [], enabled: true },
      });
    } else {
      if (!url.trim()) return;
      postToExtension({
        type: 'addMcpServer',
        server: { name: name.trim(), kind, url: url.trim(), headers: parseHeaders(headersText), enabled: true },
      });
    }
    resetForm();
  }

  return (
    <div className="mcp-manager">
      {servers.length === 0 && <p className="muted">Todavía no conectaste ningún servidor MCP.</p>}
      {servers.map((server) => (
        <div key={server.id} className="mcp-item">
          <div className="mcp-item-main">
            <input type="checkbox" checked={server.enabled} onChange={() => toggleEnabled(server)} title="Habilitado" />
            <div>
              <div className="mcp-item-name">
                {server.name} <span className={`skill-scope-badge skill-scope-${server.kind === 'stdio' ? 'project' : 'personal'}`}>{KIND_LABELS[server.kind]}</span>
              </div>
              <div className="mcp-item-meta">
                {server.kind === 'stdio' ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}` : server.url}
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
            Tipo
            <select value={kind} onChange={(e) => setKind(e.target.value as McpTransportKind)}>
              <option value="stdio">Stdio (comando local)</option>
              <option value="http">HTTP (Streamable HTTP)</option>
              <option value="sse">SSE (legacy)</option>
            </select>
          </label>
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Filesystem" />
          </label>
          {kind === 'stdio' ? (
            <>
              <label>
                Comando
                <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
              </label>
              <label>
                Argumentos (separados por espacio)
                <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /ruta" />
              </label>
            </>
          ) : (
            <>
              <label>
                URL
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mi-servidor-mcp.com/mcp" />
              </label>
              <label>
                Headers (uno por línea, "Clave: valor")
                <textarea
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  rows={2}
                  placeholder="Authorization: Bearer ..."
                />
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="submit">Agregar</button>
            <button type="button" className="btn-ghost" onClick={resetForm}>
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
