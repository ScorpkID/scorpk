import { FormEvent, useState } from 'react';
import { AgentDefinition, ModelsSource, ProviderConfig } from '../../../shared/protocol';
import { postToExtension } from '../vscodeApi';
import { ModelPicker } from './ModelPicker';
import { recommendedModelFor } from '../../../providers/providerPresets';
import { IconChevronDown, IconChevronUp, IconEdit, IconPlus, IconTrash, IconCheck } from './Icon';

function ModelSuggestion({
  providers,
  providerId,
  currentModel,
  onApply,
}: {
  providers: ProviderConfig[];
  providerId: string;
  currentModel: string;
  onApply: (model: string) => void;
}) {
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return null;
  const suggestion = recommendedModelFor(provider);
  if (!suggestion || suggestion === currentModel) return null;
  return (
    <button type="button" className="model-suggestion" onClick={() => onApply(suggestion)}>
      <IconCheck size={11} />
      Sugerencia para {provider.name}: <code>{suggestion}</code>
    </button>
  );
}

interface Props {
  agents: AgentDefinition[];
  providers: ProviderConfig[];
}

export function TeamManager({ agents, providers }: Props) {
  return (
    <div className="team-manager">
      <p className="muted">
        Activá los agentes que quieras usar y ordená el pipeline con las flechas. Tocá el lápiz para editar el
        rol, las instrucciones y el proveedor de cada uno.
      </p>
      <div className="agent-list">
        {agents.map((agent, index) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            providers={providers}
            isFirst={index === 0}
            isLast={index === agents.length - 1}
            onMove={(dir) => moveAgent(agents, agent.id, dir)}
          />
        ))}
      </div>
      <NewAgentForm providers={providers} />
    </div>
  );
}

function moveAgent(agents: AgentDefinition[], id: string, dir: -1 | 1) {
  const ids = agents.map((a) => a.id);
  const idx = ids.indexOf(id);
  const swapWith = idx + dir;
  if (swapWith < 0 || swapWith >= ids.length) return;
  [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
  postToExtension({ type: 'reorderAgents', orderedIds: ids });
}

function AgentCard({
  agent,
  providers,
  isFirst,
  isLast,
  onMove,
}: {
  agent: AgentDefinition;
  providers: ProviderConfig[];
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(agent);

  function toggleEnabled(enabled: boolean) {
    postToExtension({ type: 'updateAgent', agent: { ...agent, enabled } });
  }

  function openEdit() {
    setDraft(agent);
    setEditing(true);
  }

  function save() {
    postToExtension({ type: 'updateAgent', agent: draft });
    setEditing(false);
  }

  function cancel() {
    setDraft(agent);
    setEditing(false);
  }

  const modelsSource: ModelsSource | undefined = draft.providerId ? { kind: 'saved', providerId: draft.providerId } : undefined;
  const configured = agent.providerId && agent.model;

  return (
    <div className={`agent-card ${agent.enabled ? '' : 'agent-card-disabled'}`}>
      <div className="agent-card-row">
        <input
          type="checkbox"
          checked={agent.enabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
          title="Habilitar en el pipeline"
        />
        <span className="agent-card-name">{agent.name}</span>
        <span className="agent-role-badge">{agent.role}</span>
        {!configured && <span className="badge-warning">Sin proveedor</span>}
        <span className="toolbar-spacer" />
        <div className="agent-order-buttons">
          <button type="button" className="btn-icon" disabled={isFirst} onClick={() => onMove(-1)} title="Subir">
            <IconChevronUp size={14} />
          </button>
          <button type="button" className="btn-icon" disabled={isLast} onClick={() => onMove(1)} title="Bajar">
            <IconChevronDown size={14} />
          </button>
        </div>
        <button type="button" className="btn-icon" onClick={editing ? cancel : openEdit} title="Editar agente">
          <IconEdit size={14} />
        </button>
        {!agent.builtIn && (
          <button
            type="button"
            className="btn-icon"
            onClick={() => postToExtension({ type: 'removeAgent', id: agent.id })}
            title="Eliminar"
          >
            <IconTrash size={14} />
          </button>
        )}
      </div>

      {editing && (
        <div className="agent-card-edit">
          <label>
            Nombre
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label>
            Rol
            <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
          </label>
          <label>
            Instrucciones
            <textarea
              className="agent-prompt"
              value={draft.systemPrompt}
              onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
              rows={4}
            />
          </label>
          <div className="agent-provider-row">
            <select value={draft.providerId} onChange={(e) => setDraft({ ...draft, providerId: e.target.value, model: '' })}>
              <option value="">Sin proveedor asignado</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ModelPicker
              key={draft.providerId}
              value={draft.model}
              onChange={(v) => setDraft({ ...draft, model: v })}
              source={modelsSource}
              placeholder="modelo"
            />
          </div>
          {draft.providerId && (
            <ModelSuggestion
              providers={providers}
              providerId={draft.providerId}
              currentModel={draft.model}
              onApply={(m) => setDraft({ ...draft, model: m })}
            />
          )}
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={save}>
              Guardar
            </button>
            <button type="button" className="btn-ghost" onClick={cancel}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewAgentForm({ providers }: { providers: ProviderConfig[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');

  const modelsSource: ModelsSource | undefined = providerId ? { kind: 'saved', providerId } : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) return;
    postToExtension({
      type: 'addAgent',
      agent: {
        name: name.trim(),
        role: role.trim() || name.trim(),
        systemPrompt: systemPrompt.trim(),
        providerId,
        model,
        enabled: true,
      },
    });
    setName('');
    setRole('');
    setSystemPrompt('');
    setProviderId('');
    setModel('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="new-agent-toggle" onClick={() => setOpen(true)}>
        <IconPlus size={14} />
        Agregar agente personalizado
      </button>
    );
  }

  return (
    <form className="new-agent-form" onSubmit={submit}>
      <div className="section-heading">Nuevo agente personalizado</div>
      <label>
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Security Reviewer" />
      </label>
      <label>
        Rol (etiqueta corta, opcional)
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ej: Security" />
      </label>
      <label>
        Instrucciones (system prompt)
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} />
      </label>
      <div className="agent-provider-row">
        <select value={providerId} onChange={(e) => { setProviderId(e.target.value); setModel(''); }}>
          <option value="">Sin proveedor asignado</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ModelPicker key={providerId} value={model} onChange={setModel} source={modelsSource} placeholder="modelo" />
      </div>
      {providerId && (
        <ModelSuggestion providers={providers} providerId={providerId} currentModel={model} onApply={setModel} />
      )}
      <div className="form-actions">
        <button type="submit">Agregar</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
