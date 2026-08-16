import { useEffect, useState } from 'react';
import { requestWorkspaceFiles, requestActiveSelection } from '../vscodeApi';
import { IconCode, IconFile } from './Icon';

export interface MentionPick {
  kind: 'file' | 'selection';
  path: string;
  text?: string;
  startLine?: number;
  endLine?: number;
}

interface Props {
  query: string;
  onPick: (pick: MentionPick) => void;
  onClose: () => void;
}

export function MentionPicker({ query, onPick, onClose }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ path: string; text: string; startLine: number; endLine: number } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    requestActiveSelection().then(setSelection);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      requestWorkspaceFiles(query).then((paths) => {
        if (!cancelled) setFiles(paths);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const entries: MentionPick[] = [
    ...(selection ? [{ kind: 'selection' as const, path: selection.path, text: selection.text, startLine: selection.startLine, endLine: selection.endLine }] : []),
    ...files.map((path) => ({ kind: 'file' as const, path })),
  ];

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
        <div className="mention-empty">Sin resultados</div>
      </div>
    );
  }

  return (
    <div className="mention-picker">
      {entries.map((entry, i) => (
        <button
          type="button"
          key={entry.kind === 'selection' ? 'selection' : entry.path}
          className={i === highlighted ? 'mention-item mention-item-active' : 'mention-item'}
          onMouseEnter={() => setHighlighted(i)}
          onClick={() => onPick(entry)}
        >
          {entry.kind === 'selection' ? <IconCode size={13} /> : <IconFile size={13} />}
          {entry.kind === 'selection' ? (
            <span>
              Selección actual <span className="mention-item-meta">{entry.path} · líneas {entry.startLine}-{entry.endLine}</span>
            </span>
          ) : (
            <span>{entry.path}</span>
          )}
        </button>
      ))}
    </div>
  );
}
