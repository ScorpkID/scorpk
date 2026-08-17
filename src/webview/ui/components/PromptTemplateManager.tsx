import { FormEvent, useEffect, useState } from 'react';
import { PromptTemplate } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconPlus, IconTrash, IconZap } from './Icon';

export function PromptTemplateManager() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState('');
  const [expansion, setExpansion] = useState('');
  const [attachActiveFile, setAttachActiveFile] = useState(true);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'promptTemplates') setTemplates(message.templates);
    });
    postToExtension({ type: 'listPromptTemplates' });
    return unsubscribe;
  }, []);

  function remove(id: string) {
    postToExtension({ type: 'removePromptTemplate', id });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const cleanTrigger = trigger.trim().replace(/^\//, '');
    if (!cleanTrigger || !expansion.trim()) return;
    postToExtension({
      type: 'addPromptTemplate',
      template: { trigger: cleanTrigger, label: `/${cleanTrigger}`, expansion: expansion.trim(), attachActiveFile },
    });
    setTrigger('');
    setExpansion('');
    setAttachActiveFile(true);
    setOpen(false);
  }

  return (
    <div className="mcp-manager">
      {templates.length === 0 && <p className="muted">Todavía no hay comandos rápidos configurados.</p>}
      {templates.map((t) => (
        <div key={t.id} className="mcp-item">
          <div className="mcp-item-main">
            <IconZap size={14} />
            <div>
              <div className="mcp-item-name">{t.label}</div>
              <div className="mcp-item-meta">{t.expansion}</div>
            </div>
            <span className="toolbar-spacer" />
            <button type="button" className="btn-icon" onClick={() => remove(t.id)} title="Eliminar">
              <IconTrash size={13} />
            </button>
          </div>
        </div>
      ))}

      {open ? (
        <form className="mcp-form" onSubmit={submit}>
          <label>
            Comando (sin la barra)
            <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="test" />
          </label>
          <label>
            Instrucción que expande
            <textarea value={expansion} onChange={(e) => setExpansion(e.target.value)} rows={3} />
          </label>
          <label className="settings-toggle">
            <input type="checkbox" checked={attachActiveFile} onChange={(e) => setAttachActiveFile(e.target.checked)} />
            Adjuntar la selección activa del editor, si hay una
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
          Agregar comando rápido
        </button>
      )}
    </div>
  );
}
