import { useEffect, useRef, useState } from 'react';
import { AgentDefinition, AttachmentRef, PermissionMode, TeamRunSummary, TeamStreamEvent } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage, requestAutoModeConfirmation } from '../vscodeApi';
import { ToolCallLog, ToolBlock, formatDuration } from './ToolCallLog';
import { AskUserCard } from './AskUserCard';
import { MarkdownMessage } from './MarkdownMessage';
import { ModeSelector } from './ModeSelector';
import { HistoryPanel } from './HistoryPanel';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';
import { ThinkingIndicator } from './ThinkingIndicator';
import { IconCheck, IconClock, IconRefresh, IconScorpion, IconX } from './Icon';

const ASK_USER_TOOL_NAME = 'ask_user';
const CELEBRATE_THRESHOLD_MS = 4000;

interface Props {
  agents: AgentDefinition[];
  onGoToTeam: () => void;
}

type Block =
  | { type: 'agent-header'; key: string; agentName: string; role: string }
  | { type: 'user'; id: string; text: string }
  | { type: 'assistant'; id: string; text: string; done: boolean; startedAt: number; durationMs?: number }
  | ({ type: 'tool' } & ToolBlock)
  | { type: 'thinking'; id: string }
  | { type: 'error'; id: string; text: string };

type Mode = 'team' | 'agent';

function withoutThinking(blocks: Block[]): Block[] {
  return blocks.filter((b) => b.type !== 'thinking');
}

export function applyTeamEvent(blocks: Block[], ev: TeamStreamEvent): Block[] {
  switch (ev.kind) {
    case 'run-start':
      // En modo "todo el equipo" (pipeline) esta es la única vez que se ve
      // la tarea que escribió el usuario — a diferencia del modo "agente
      // específico", acá no hay un evento agent-user-message aparte.
      if (ev.mode === 'pipeline') {
        return [...withoutThinking(blocks), { type: 'user', id: cryptoId(), text: ev.task }];
      }
      return blocks;
    case 'agent-start':
      return [
        ...withoutThinking(blocks),
        { type: 'agent-header', key: cryptoId(), agentName: ev.agentName, role: ev.role },
        { type: 'thinking', id: cryptoId() },
      ];
    case 'agent-user-message':
      return [...withoutThinking(blocks), { type: 'user', id: ev.id, text: ev.text }, { type: 'thinking', id: cryptoId() }];
    case 'agent-text-delta': {
      const base = withoutThinking(blocks);
      const idx = base.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1)
        return [...base, { type: 'assistant', id: ev.id, text: ev.textDelta, done: false, startedAt: Date.now() }];
      const copy = [...base];
      const block = copy[idx] as Extract<Block, { type: 'assistant' }>;
      copy[idx] = { ...block, text: block.text + ev.textDelta };
      return copy;
    }
    case 'agent-text-done': {
      const idx = blocks.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as Extract<Block, { type: 'assistant' }>;
      copy[idx] = { ...block, done: true, durationMs: Date.now() - block.startedAt };
      return copy;
    }
    case 'agent-tool-call':
      return [
        ...withoutThinking(blocks),
        {
          type: 'tool',
          callId: ev.callId,
          name: ev.name,
          args: ev.args,
          status: ev.needsApproval ? 'pending-approval' : 'running',
          diff: ev.diff,
          startedAt: Date.now(),
        },
      ];
    case 'agent-tool-result': {
      const idx = blocks.findIndex((b) => b.type === 'tool' && b.callId === ev.callId);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as ToolBlock & { type: 'tool' };
      copy[idx] = {
        ...block,
        status: ev.isError ? 'error' : 'done',
        result: ev.result,
        durationMs: block.startedAt ? Date.now() - block.startedAt : undefined,
      };
      return copy;
    }
    case 'agent-tool-rejected': {
      const idx = blocks.findIndex((b) => b.type === 'tool' && b.callId === ev.callId);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as ToolBlock & { type: 'tool' };
      copy[idx] = { ...block, status: 'rejected', reason: ev.reason };
      return copy;
    }
    case 'run-error':
      return [...withoutThinking(blocks), { type: 'error', id: cryptoId(), text: ev.message }];
    case 'run-cancelled':
      return [...withoutThinking(blocks), { type: 'error', id: cryptoId(), text: 'Cancelado por el usuario.' }];
    case 'agent-done':
      return withoutThinking(blocks);
    default:
      return blocks;
  }
}

export function TeamChatView({ agents, onGoToTeam }: Props) {
  const [mode, setMode] = useState<Mode>('team');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('manual');
  const [targetAgentId, setTargetAgentId] = useState('');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns] = useState<TeamRunSummary[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const runStartRef = useRef<number | null>(null);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout>>();

  function triggerCelebration() {
    setCelebrate(true);
    clearTimeout(celebrateTimerRef.current);
    celebrateTimerRef.current = setTimeout(() => setCelebrate(false), 2200);
  }

  useEffect(() => {
    if (!targetAgentId && agents.length > 0) setTargetAgentId(agents[0].id);
  }, [agents, targetAgentId]);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'error') {
        setBlocks((prev) => [...withoutThinking(prev), { type: 'error', id: cryptoId(), text: message.message }]);
        setRunning(false);
        return;
      }
      if (message.type === 'teamRuns') {
        setRuns(message.runs);
        return;
      }
      if (message.type === 'teamRunLoaded') {
        setBlocks(message.events.reduce(applyTeamEvent, [] as Block[]));
        setRunning(false);
        setShowHistory(false);
        return;
      }
      if (message.type === 'teamRunState') {
        // Igual que en Agente: si el webview se recreó mientras una tarea de
        // equipo seguía corriendo, reconectamos el estado visual.
        setRunning(message.running);
        if (message.running) {
          setBlocks((prev) => (prev.some((b) => b.type === 'thinking') ? prev : [...prev, { type: 'thinking', id: cryptoId() }]));
        }
        return;
      }
      if (message.type !== 'teamEvent') return;
      const ev = message.event;
      setBlocks((prev) => applyTeamEvent(prev, ev));
      if (ev.kind === 'run-done') {
        const start = runStartRef.current;
        if (start && Date.now() - start > CELEBRATE_THRESHOLD_MS) triggerCelebration();
      }
      if (ev.kind === 'run-done' || ev.kind === 'run-error' || ev.kind === 'run-cancelled') setRunning(false);
    });
    postToExtension({ type: 'listTeamRuns' });
    return unsubscribe;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [blocks]);

  function send() {
    const text = input.trim();
    if (!text || running) return;
    if (mode === 'agent' && !targetAgentId) return;
    runStartRef.current = Date.now();
    setRunning(true);
    setInput('');
    const currentAttachments = attachments.length > 0 ? attachments : undefined;
    setAttachments([]);
    if (mode === 'team') {
      postToExtension({ type: 'runTeam', task: text, mode: permissionMode, attachments: currentAttachments });
    } else {
      postToExtension({ type: 'sendToAgent', agentId: targetAgentId, text, mode: permissionMode, attachments: currentAttachments });
    }
  }

  function cancel() {
    postToExtension({ type: 'cancelRun', scope: 'team' });
  }

  async function handlePermissionModeChange(next: PermissionMode) {
    if (next === 'auto' && permissionMode !== 'auto') {
      const confirmed = await requestAutoModeConfirmation();
      if (!confirmed) return;
    }
    setPermissionMode(next);
  }

  function newRun() {
    setBlocks([]);
  }

  function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next) postToExtension({ type: 'listTeamRuns' });
  }

  function resetMemory() {
    if (!targetAgentId) return;
    postToExtension({ type: 'resetAgentMemory', agentId: targetAgentId });
    setBlocks([]);
  }

  const enabledCount = agents.filter((a) => a.enabled).length;

  if (agents.length === 0) {
    return (
      <div className="chat-empty">
        <p>Todavía no armaste tu equipo — sin agentes no hay con quién repartir el trabajo.</p>
        <button className="btn-primary" onClick={onGoToTeam}>
          Ir a Equipo
        </button>
      </div>
    );
  }

  return (
    <div className="chat-view">
      {celebrate && (
        <div className="run-complete-badge" role="status">
          <IconCheck size={13} />
          Listo
        </div>
      )}
      <div className="agent-config">
        <div className="agent-config-row">
          <select className="model-select" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="team">Todo el equipo ({enabledCount} habilitados)</option>
            <option value="agent">Agente específico</option>
          </select>
          {mode === 'agent' && (
            <select value={targetAgentId} onChange={(e) => setTargetAgentId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {mode === 'agent' && (
            <button className="btn-icon" onClick={resetMemory} title="Reiniciar memoria de este agente">
              <IconRefresh size={15} />
            </button>
          )}
          <span className="toolbar-spacer" />
          <button className="btn-icon" onClick={newRun} title="Limpiar vista">
            <IconX size={15} />
          </button>
          <button className="btn-icon" onClick={toggleHistory} title="Historial de ejecuciones de equipo">
            <IconClock size={15} />
          </button>
        </div>
        <ModeSelector value={permissionMode} onChange={handlePermissionModeChange} disabled={running} remindAuto={blocks.length === 0} />
      </div>

      {showHistory ? (
        <HistoryPanel
          items={runs}
          emptyLabel="El equipo todavía no corrió nada — su primera tarea va a quedar acá."
          onSelect={(id) => postToExtension({ type: 'openTeamRun', id })}
          onRename={(id, title) => postToExtension({ type: 'renameTeamRun', id, title })}
          onDelete={(id) => postToExtension({ type: 'deleteTeamRun', id })}
        />
      ) : (
        <>
          <div className="chat-log">
            {blocks.length === 0 && (
              <EmptyState
                icon={<IconScorpion size={40} animated="idle" />}
                title="El equipo está listo"
                subtitle="Mandale una tarea y la reparten entre todos."
              />
            )}
            {blocks.map((b) => {
              if (b.type === 'agent-header') {
                return (
                  <div key={b.key} className="agent-divider">
                    <span className="agent-divider-name">{b.agentName}</span>
                    <span className="agent-divider-role">{b.role}</span>
                  </div>
                );
              }
              if (b.type === 'thinking') {
                return (
                  <div key={b.id} className="msg-row role-assistant thinking-row">
                    <ThinkingIndicator />
                  </div>
                );
              }
              if (b.type === 'user') {
                return (
                  <div key={b.id} className="msg-row role-user">
                    <span className="msg-label">Vos</span>
                    <div className="msg-body">{b.text}</div>
                  </div>
                );
              }
              if (b.type === 'assistant') {
                return (
                  <div key={b.id} className="msg-row role-assistant">
                    {b.durationMs !== undefined && (
                      <span className="msg-label">
                        <span className="msg-duration">{formatDuration(b.durationMs)}</span>
                      </span>
                    )}
                    <div className="msg-body">
                      <MarkdownMessage text={b.text} />
                      {!b.done && <span className="cursor" />}
                    </div>
                  </div>
                );
              }
              if (b.type === 'tool' && b.name === ASK_USER_TOOL_NAME) {
                return (
                  <AskUserCard
                    key={b.callId}
                    block={{
                      callId: b.callId,
                      question: String(b.args.question ?? ''),
                      options: Array.isArray(b.args.options) ? b.args.options.map(String) : [],
                      answered: b.status === 'done',
                      answer: b.result,
                    }}
                  />
                );
              }
              if (b.type === 'tool') {
                return <ToolCallLog key={b.callId} block={b} />;
              }
              return (
                <div key={b.id} className="msg-row role-error">
                  <span className="msg-label">Error</span>
                  <div className="msg-body">{b.text}</div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSend={send}
            onCancel={cancel}
            running={running}
            placeholder={mode === 'team' ? 'Describí la tarea para el equipo...' : 'Mensaje para el agente seleccionado...'}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        </>
      )}
    </div>
  );
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2);
}
