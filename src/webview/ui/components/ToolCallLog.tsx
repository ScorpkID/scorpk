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
  startedAt?: number;
  durationMs?: number;
}

const TOOL_ICONS: Record<string, (size: number) => JSX.Element> = {
  read_file: (s) => <IconFile size={s} />,
  list_dir: (s) => <IconFolder size={s} />,
  write_file: (s) => <IconEdit size={s} />,
  edit_file: (s) => <IconEdit size={s} />,
  delete_file: (s) => <IconTrash size={s} />,
  run_terminal_command: (s) => <IconTerminal size={s} />,
  git_status: (s) => <IconGitBranch size={s} />,
  git_diff: (s) => <IconGitBranch size={s} />,
};

const TOOL_LABELS: Record<string, string> = {
  read_file: 'Leer',
  list_dir: 'Listar',
  write_file: 'Escribir',
  edit_file: 'Editar',
  delete_file: 'Borrar',
  run_terminal_command: 'Terminal',
  git_status: 'Git status',
  git_diff: 'Git diff',
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
  const label = TOOL_LABELS[block.name] ?? block.name;
  const path = typeof block.args.path === 'string' ? block.args.path : '';
  const isTerminal = block.name === 'run_terminal_command';
  const command = isTerminal ? String(block.args.command ?? '') : '';

  return (
    <div className={`tool-call tool-call-${block.status}`}>
      <div className="tool-call-header">
        <span className="tool-call-icon">{iconFn(14)}</span>
        <span className="tool-call-label">{label}</span>
        {path && <span className="tool-call-path">{path}</span>}
        {!path && !isTerminal && <span className="tool-call-args">{summarizeArgs(block.args)}</span>}
        <span className="toolbar-spacer" />
        {block.status === 'running' && (
          <span className="tool-call-spinner">
            <IconLoader size={13} />
          </span>
        )}
        {block.durationMs !== undefined && (block.status === 'done' || block.status === 'error') && (
          <span className="tool-call-duration">{formatDuration(block.durationMs)}</span>
        )}
      </div>

      {isTerminal && command && <div className="tool-call-command">$ {command}</div>}

      {block.diff && <DiffView diff={block.diff} />}

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
          <pre className={block.status === 'error' ? 'tool-call-result-error' : isTerminal ? 'tool-call-terminal-output' : 'tool-call-result'}>
            {shown}
          </pre>
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

export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 1) return '<1s';
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
