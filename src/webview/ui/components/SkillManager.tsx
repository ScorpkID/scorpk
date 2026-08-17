import { FormEvent, useEffect, useState } from 'react';
import { SkillSummary } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconPlus, IconZap } from './Icon';

export function SkillManager() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'project' | 'personal'>('project');

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'skills') setSkills(message.skills);
    });
    postToExtension({ type: 'listSkills' });
    return unsubscribe;
  }, []);

  function openSkill(path: string) {
    postToExtension({ type: 'openSkill', path });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanName) return;
    postToExtension({ type: 'createSkill', name: cleanName, scope });
    setName('');
    setScope('project');
    setOpen(false);
  }

  return (
    <div className="mcp-manager">
      {skills.length === 0 && <p className="muted">Todavía no hay skills — creá una para empezar.</p>}
      {skills.map((s) => (
        <button key={`${s.scope}:${s.name}`} type="button" className="mcp-item skill-item" onClick={() => openSkill(s.path)}>
          <div className="mcp-item-main">
            <IconZap size={14} />
            <div>
              <div className="mcp-item-name">
                {s.name} <span className={`skill-scope-badge skill-scope-${s.scope}`}>{s.scope === 'project' ? 'Proyecto' : 'Personal'}</span>
              </div>
              <div className="mcp-item-meta">{s.description}</div>
            </div>
          </div>
        </button>
      ))}

      {open ? (
        <form className="mcp-form" onSubmit={submit}>
          <label>
            Nombre de la skill
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="pdf-fill" autoFocus />
          </label>
          <label>
            Alcance
            <select value={scope} onChange={(e) => setScope(e.target.value as 'project' | 'personal')}>
              <option value="project">Proyecto (.scorpk/skills, se versiona con git)</option>
              <option value="personal">Personal (todos tus proyectos)</option>
            </select>
          </label>
          <p className="muted">Se crea SKILL.md con una plantilla y se abre en el editor para que escribas el resto.</p>
          <div className="form-actions">
            <button type="submit">Crear</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="new-agent-toggle" onClick={() => setOpen(true)}>
          <IconPlus size={14} />
          Nueva skill
        </button>
      )}
    </div>
  );
}
