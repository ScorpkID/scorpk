import { KeyboardEvent, useState } from 'react';
import { postToExtension } from '../vscodeApi';
import { IconCheck } from './Icon';

export interface AskUserBlock {
  callId: string;
  question: string;
  options: string[];
  answered: boolean;
  answer?: string;
}

export function AskUserCard({ block }: { block: AskUserBlock }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState('');

  function choose(answer: string) {
    postToExtension({ type: 'answerQuestion', callId: block.callId, answer });
  }

  function submitCustom() {
    if (!customText.trim()) return;
    choose(customText.trim());
  }

  function onCustomKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCustom();
    }
  }

  return (
    <div className="ask-user-card">
      <div className="ask-user-question">{block.question}</div>

      {block.answered ? (
        <div className="ask-user-answer">
          <IconCheck size={13} />
          {block.answer}
        </div>
      ) : (
        <div className="ask-user-options">
          {block.options.map((option) => (
            <button key={option} type="button" className="ask-user-option" onClick={() => choose(option)}>
              {option}
            </button>
          ))}
          {!showCustom ? (
            <button type="button" className="ask-user-option ask-user-other" onClick={() => setShowCustom(true)}>
              Otra respuesta...
            </button>
          ) : (
            <div className="ask-user-custom-row">
              <input
                autoFocus
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={onCustomKeyDown}
                placeholder="Escribí tu respuesta..."
              />
              <button type="button" className="btn-primary" onClick={submitCustom} disabled={!customText.trim()}>
                Enviar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
