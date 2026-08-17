import { FormEvent, KeyboardEvent, RefObject, useRef, useState } from 'react';
import { AttachmentRef, PromptTemplate } from '../../../shared/protocol';
import { requestFilePick, requestActiveSelection } from '../vscodeApi';
import { IconCode, IconPaperclip, IconSend, IconX } from './Icon';
import { ThinkingIndicator } from './ThinkingIndicator';
import { MentionPicker, MentionPick } from './MentionPicker';
import { SlashCommandPicker } from './SlashCommandPicker';
import { AttachmentChips } from './AttachmentChips';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  running: boolean;
  placeholder: string;
  attachments: AttachmentRef[];
  onAttachmentsChange: (next: AttachmentRef[]) => void;
}

export function Composer({ value, onChange, onSend, onCancel, running, placeholder, attachments, onAttachmentsChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [slash, setSlash] = useState<{ query: string } | null>(null);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention || slash) return; // el picker maneja sus propias teclas (flechas/Enter/Escape)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function handleChange(next: string) {
    onChange(next);
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? next.length;
    const uptoCaret = next.slice(0, caret);

    // "/" solo cuenta como comando rápido si es el primer carácter del
    // mensaje (no en medio de una frase).
    if (next[0] === '/' && !/\s/.test(uptoCaret)) {
      setSlash({ query: uptoCaret.slice(1) });
      setMention(null);
      return;
    }
    setSlash(null);

    const atIndex = uptoCaret.lastIndexOf('@');
    if (atIndex === -1) {
      setMention(null);
      return;
    }
    const between = uptoCaret.slice(atIndex + 1);
    if (/\s/.test(between)) {
      setMention(null);
      return;
    }
    setMention({ start: atIndex, query: between });
  }

  function closeMention() {
    setMention(null);
    textareaRef.current?.focus();
  }

  function closeSlash() {
    setSlash(null);
    textareaRef.current?.focus();
  }

  async function pickSlash(template: PromptTemplate) {
    let next = template.expansion;
    if (template.attachActiveFile) {
      const selection = await requestActiveSelection();
      if (selection) {
        next += `\n\n\`\`\`\n${selection.text}\n\`\`\``;
      }
    }
    onChange(next);
    setSlash(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(next.length, next.length);
    });
  }

  function pickMention(pick: MentionPick) {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);

    if (pick.kind === 'selection' && pick.text) {
      const block = `\`\`\`\n${pick.text}\n\`\`\`\n`;
      const next = before + block + after;
      onChange(next);
      requestAnimationFrame(() => {
        el?.focus();
        const pos = (before + block).length;
        el?.setSelectionRange(pos, pos);
      });
    } else {
      const next = before + after;
      onChange(next);
      if (!attachments.some((a) => a.path === pick.path)) {
        onAttachmentsChange([...attachments, { path: pick.path }]);
      }
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(before.length, before.length);
      });
    }
    setMention(null);
  }

  async function attachFile() {
    const path = await requestFilePick();
    if (path && !attachments.some((a) => a.path === path)) {
      onAttachmentsChange([...attachments, { path }]);
    }
  }

  function removeAttachment(path: string) {
    onAttachmentsChange(attachments.filter((a) => a.path !== path));
  }

  function insertCodeBlock() {
    const el = textareaRef.current;
    const selected = el ? value.slice(el.selectionStart, el.selectionEnd) : '';
    insertAtCursor(textareaRef, onChange, value, selected ? '```\n' + selected + '\n```' : '```\n\n```');
  }

  return (
    <div className="composer">
      <AttachmentChips items={attachments} onRemove={removeAttachment} />
      {slash && <SlashCommandPicker query={slash.query} onPick={pickSlash} onClose={closeSlash} />}
      {mention && <MentionPicker query={mention.query} onPick={pickMention} onClose={closeMention} />}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
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
            {running ? <ThinkingIndicator /> : 'Enter para enviar · Shift+Enter nueva línea · @ para adjuntar · / para comandos'}
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
