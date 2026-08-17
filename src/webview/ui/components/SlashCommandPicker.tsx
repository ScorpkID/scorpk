import { useEffect, useState } from 'react';
import { PromptTemplate } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconZap } from './Icon';

interface Props {
  query: string;
  onPick: (template: PromptTemplate) => void;
  onClose: () => void;
}

export function SlashCommandPicker({ query, onPick, onClose }: Props) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'promptTemplates') setTemplates(message.templates);
    });
    postToExtension({ type: 'listPromptTemplates' });
    return unsubscribe;
  }, []);

  const q = query.trim().toLowerCase();
  const entries = q ? templates.filter((t) => t.trigger.toLowerCase().includes(q)) : templates;

  useEffect(() => {
    setHighlighted(0);
  }, [entries.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, entries.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = entries[highlighted];
        if (entry) onPick(entry);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [entries, highlighted, onPick, onClose]);

  if (entries.length === 0) {
    return (
      <div className="mention-picker">
        <div className="mention-empty">Sin comandos rápidos que coincidan</div>
      </div>
    );
  }

  return (
    <div className="mention-picker">
      {entries.map((entry, i) => (
        <button
          type="button"
          key={entry.id}
          className={i === highlighted ? 'mention-item mention-item-active' : 'mention-item'}
          onMouseEnter={() => setHighlighted(i)}
          onClick={() => onPick(entry)}
        >
          <IconZap size={13} />
          <span>
            {entry.label} <span className="mention-item-meta">{entry.expansion}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
