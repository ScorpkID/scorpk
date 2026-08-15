import { useState } from 'react';
import { postToExtension } from '../vscodeApi';
import { IconChevronDown, IconChevronUp, IconEdit, IconFile, IconFolder, IconGitBranch, IconLoader, IconTerminal, IconTrash, IconWrench } from './Icon';

export interface ToolBlock {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending-approval' | 'running' | 'done' | 'error' | 'rejected';
  result?: string;
  reason?: string;
  diff?: string;
}

const TOOL_ICONS: Record<string, (size: number) => JSX.Element> = {
  read_file: (s) => <IconFile size={s} />,
  list_dir: (s) => <IconFolder size={s} />,
  write_file: (s) => <IconEdit size={s} />,
  delete_file: (s) => <IconTrash size={s} />,
  run_terminal_command: (s) => <IconTerminal size={s} />,
  git_status: (s) => <IconGitBranch size={s} />,
  git_diff: (s) => <IconGitBranch size={s} />,
};

const COLLAPSE_THRESHOLD = 400;

export function ToolCallLog({ block }: { block: ToolBlock }) {
  const [expanded, setExpanded] = useState(false);

  function approve(approved: boolean) {
    postToExtension({ type: 'approveTool', callId: block.callId, approved });
  }

  const result = block.result ?? '';
  const isLong = result.length > COLLAPSE_THRESHOLD;
  const shown = isLong && !expanded ? result.slice(0, COLLAPSE_THRESHOLD) + '…' : result;
  const iconFn = TOOL_ICONS[block.name] ?? ((s: number) => <IconWrench size={s} />);

  return (
    <div className={`tool-call tool-call-${block.status}`}>
      <div className="tool-call-header">
        <span className="tool-call-icon">{iconFn(14)}</span>
        <span className="tool-call-name">{block.name}</span>
        <span className="tool-call-args">{summarizeArgs(block.args)}</span>
        {block.status === 'running' && (
          <span className="tool-call-spinner">
            <IconLoader size={13} />
          </span>
        )}
      </div>
      {block.status === 'pending-approval' && block.diff && <DiffView diff={block.diff} />}
      {block.status === 'pending-approval' && (
        <div className="tool-call-approval">
          <span>Requiere aprobación</span>
          <button onClick={() => approve(true)}>Aprobar</button>
          <button onClick={() => approve(false)}>Rechazar</button>
        </div>
      )}
      {block.status === 'rejected' && (
        <div className="tool-call-status">{block.reason ?? 'Rechazado por el usuario.'}</div>
      )}
      {result && (
        <>
          <pre className={block.status === 'error' ? 'tool-call-result-error' : 'tool-call-result'}>{shown}</pre>
          {isLong && (
            <button type="button" className="tool-call-toggle" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (
                <>
                  <IconChevronUp size={12} /> Ver menos
                </>
              ) : (
                <>
                  <IconChevronDown size={12} /> Ver todo
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const DIFF_COLLAPSE_LINES = 24;

function DiffView({ diff }: { diff: string }) {
  const [expanded, setExpanded] = useState(false);
  const allLines = diff.split('\n');
  const isLong = allLines.length > DIFF_COLLAPSE_LINES;
  const lines = isLong && !expanded ? allLines.slice(0, DIFF_COLLAPSE_LINES) : allLines;

  return (
    <div className="diff-view">
      <pre className="diff-view-pre">
        {lines.map((line, i) => {
          const kind = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
          return (
            <div key={i} className={`diff-line diff-line-${kind}`}>
              {line}
            </div>
          );
        })}
      </pre>
      {isLong && (
        <button type="button" className="tool-call-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? (
            <>
              <IconChevronUp size={12} /> Ver menos
            </>
          ) : (
            <>
              <IconChevronDown size={12} /> Ver diff completo ({allLines.length} líneas)
            </>
          )}
        </button>
      )}
    </div>
  );
}

function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return '(' + entries.map(([k, v]) => `${k}: ${truncate(String(v))}`).join(', ') + ')';
}

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}
