import { MouseEvent, ReactNode, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface Props {
  text: string;
}

export function MarkdownMessage({ text }: Props) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  function copy(e: MouseEvent<HTMLButtonElement>) {
    const pre = e.currentTarget.closest('.code-block')?.querySelector('code');
    const text = pre?.textContent ?? '';
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard no disponible, ignorar */
      });
  }

  return (
    <div className="code-block">
      <button type="button" className="code-copy-btn" onClick={copy}>
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <pre>{children}</pre>
    </div>
  );
}
