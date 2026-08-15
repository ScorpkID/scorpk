import { useEffect, useState } from 'react';
import { IconLoader } from './Icon';

const THINKING_WORDS = [
  'Pensando',
  'Analizando',
  'Investigando',
  'Cavilando',
  'Meditando',
  'Deliberando',
  'Maquinando',
  'Tejiendo',
  'Orquestando',
  'Destilando',
  'Reticulando',
  'Combobulando',
  'Bootstrapeando',
  'Percolando',
  'Fermentando',
  'Aguijoneando',
  'Enroscando',
  'Scorpkeando',
];

const WORD_INTERVAL_MS = 2200;

export function ThinkingIndicator() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * THINKING_WORDS.length));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const wordTimer = setInterval(() => {
      setIndex((i) => (i + 1) % THINKING_WORDS.length);
    }, WORD_INTERVAL_MS);
    const clockTimer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(wordTimer);
      clearInterval(clockTimer);
    };
  }, []);

  return (
    <span className="thinking-indicator">
      <IconLoader size={12} />
      <span key={index} className="thinking-word">
        {THINKING_WORDS[index]}...
      </span>
      <span className="thinking-elapsed">{elapsed}s</span>
    </span>
  );
}
