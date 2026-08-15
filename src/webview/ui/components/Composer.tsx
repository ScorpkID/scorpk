import { FormEvent, KeyboardEvent, RefObject, useRef } from 'react';
import { requestFilePick } from '../vscodeApi';
import { IconCode, IconPaperclip, IconSend, IconX } from './Icon';
import { ThinkingIndicator } from './ThinkingIndicator';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  running: boolean;
  placeholder: string;
}

export function Composer({ value, onChange, onSend, onCancel, running, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  async function attachFile() {
    const path = await requestFilePick();
    if (path) insertAtCursor(textareaRef, onChange, value, `@${path} `);
  }

  function insertCodeBlock() {
    const el = textareaRef.current;
    const selected = el ? value.slice(el.selectionStart, el.selectionEnd) : '';
    insertAtCursor(textareaRef, onChange, value, selected ? '```\n' + selected + '\n```' : '```\n\n```');
  }

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={autoResize}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={running}
      />
      <div className="composer-toolbar">
        <div className="composer-tools">
          <button type="button" className="btn-icon" title="Adjuntar archivo" onClick={attachFile} disabled={running}>
            <IconPaperclip size={15} />
          </button>
          <button type="button" className="btn-icon" title="Insertar bloque de código" onClick={insertCodeBlock} disabled={running}>
            <IconCode size={15} />
          </button>
          <span className="composer-hint">
            {running ? <ThinkingIndicator /> : 'Enter para enviar · Shift+Enter nueva línea'}
          </span>
        </div>
        {running && onCancel ? (
          <button className="composer-send composer-stop" onClick={onCancel} title="Detener">
            <IconX size={15} />
          </button>
        ) : (
          <button className="btn-primary composer-send" onClick={onSend} disabled={running || !value.trim()} title="Enviar">
            <IconSend size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function insertAtCursor(
  ref: RefObject<HTMLTextAreaElement>,
  onChange: (value: string) => void,
  current: string,
  insert: string,
): void {
  const el = ref.current;
  if (!el) {
    onChange(current + insert);
    return;
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const next = current.slice(0, start) + insert + current.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + insert.length;
    el.setSelectionRange(caret, caret);
  });
}

function autoResize(e: FormEvent<HTMLTextAreaElement>): void {
  const el = e.currentTarget;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}
