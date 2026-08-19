import { useState } from 'react';
import { IconEdit, IconPlus, IconTrash } from './Icon';

export interface HistoryEntry {
  id: string;
  title: string;
  updatedAt: number;
}

interface Props {
  items: HistoryEntry[];
  activeId?: string | null;
  emptyLabel: string;
  newLabel?: string;
  onSelect: (id: string) => void;
  onNew?: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function HistoryPanel({ items, activeId, emptyLabel, newLabel, onSelect, onNew, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  function startRename(item: HistoryEntry) {
    setEditingId(item.id);
    setEditingTitle(item.title);
  }

  function commitRename() {
    if (editingId && editingTitle.trim()) {
      onRename(editingId, editingTitle.trim());
    }
    setEditingId(null);
  }

  return (
    <div className="history-panel">
      {onNew && (
        <button type="button" className="history-new-btn btn-primary" onClick={onNew}>
          <IconPlus size={14} />
          {newLabel ?? 'Nueva conversación'}
        </button>
      )}
      {items.length === 0 && <p className="muted">{emptyLabel}</p>}
      <div className="history-list">
        {items.map((item) => (
          <div key={item.id} className={item.id === activeId ? 'history-item active' : 'history-item'}>
            {editingId === item.id ? (
              <input
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <button type="button" className="history-item-title btn-ghost" onClick={() => onSelect(item.id)}>
                <span>{item.title}</span>
                <span className="history-item-date">{relativeDate(item.updatedAt)}</span>
              </button>
            )}
            <div className="history-item-actions">
              <button type="button" className="btn-icon" title="Renombrar" onClick={() => startRename(item)}>
                <IconEdit size={13} />
              </button>
              <button type="button" className="btn-icon" title="Eliminar" onClick={() => onDelete(item.id)}>
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function relativeDate(ts: number): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(ts).toLocaleDateString();
}
