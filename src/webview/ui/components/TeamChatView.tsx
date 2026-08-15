import { useEffect, useRef, useState } from 'react';
import { AgentDefinition, PermissionMode, TeamRunSummary, TeamStreamEvent } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage, requestAutoModeConfirmation } from '../vscodeApi';
import { ToolCallLog, ToolBlock } from './ToolCallLog';
import { MarkdownMessage } from './MarkdownMessage';
import { ModeSelector } from './ModeSelector';
import { HistoryPanel } from './HistoryPanel';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';
import { IconClock, IconRefresh, IconUsers, IconX } from './Icon';

interface Props {
  agents: AgentDefinition[];
  onGoToTeam: () => void;
}

type Block =
  | { type: 'agent-header'; key: string; agentName: string; role: string }
  | { type: 'user'; id: string; text: string }
  | { type: 'assistant'; id: string; text: string; done: boolean }
  | ({ type: 'tool' } & ToolBlock)
  | { type: 'error'; id: string; text: string };

type Mode = 'team' | 'agent';

export function applyTeamEvent(blocks: Block[], ev: TeamStreamEvent): Block[] {
  switch (ev.kind) {
    case 'agent-start':
      return [...blocks, { type: 'agent-header', key: cryptoId(), agentName: ev.agentName, role: ev.role }];
    case 'agent-user-message':
      return [...blocks, { type: 'user', id: ev.id, text: ev.text }];
    case 'agent-text-delta': {
      const idx = blocks.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1) return [...blocks, { type: 'assistant', id: ev.id, text: ev.textDelta, done: false }];
      const copy = [...blocks];
      const block = copy[idx] as { type: 'assistant'; id: string; text: string; done: boolean };
      copy[idx] = { ...block, text: block.text + ev.textDelta };
      return copy;
    }
    case 'agent-text-done': {
      const idx = blocks.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as { type: 'assistant'; id: string; text: string; done: boolean };
      copy[idx] = { ...block, done: true };
      return copy;
    }
    case 'agent-tool-call':
      return [
        ...blocks,
        {
          type: 'tool',
          callId: ev.callId,
          name: ev.name,
          args: ev.args,
          status: ev.needsApproval ? 'pending-approval' : 'running',
          diff: ev.diff,
        },
      ];
    case 'agent-tool-result': {
      const idx = blocks.findIndex((b) => b.type === 'tool' && b.callId === ev.callId);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as ToolBlock & { type: 'tool' };
      copy[idx] = { ...block, status: ev.isError ? 'error' : 'done', result: ev.result };
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
      return [...blocks, { type: 'error', id: cryptoId(), text: ev.message }];
    case 'run-cancelled':
      return [...blocks, { type: 'error', id: cryptoId(), text: 'Cancelado por el usuario.' }];
    default:
      return blocks;
  }
}

export function TeamChatView({ agents, onGoToTeam }: Props) {
  const [mode, setMode] = useState<Mode>('team');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('manual');
  const [targetAgentId, setTargetAgentId] = useState('');
  const [input, setInput] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns] = useState<TeamRunSummary[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!targetAgentId && agents.length > 0) setTargetAgentId(agents[0].id);
  }, [agents, targetAgentId]);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'error') {
        setBlocks((prev) => [...prev, { type: 'error', id: cryptoId(), text: message.message }]);
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
      if (message.type !== 'teamEvent') return;
      const ev = message.event;
      setBlocks((prev) => applyTeamEvent(prev, ev));
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
    setRunning(true);
    setInput('');
    if (mode === 'team') {
      postToExtension({ type: 'runTeam', task: text, mode: permissionMode });
    } else {
      postToExtension({ type: 'sendToAgent', agentId: targetAgentId, text, mode: permissionMode });
    }
  }

  function cancel() {
    postToExtension({ type: 'cancelRun' });
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

  function resetMemory() {
    if (!targetAgentId) return;
    postToExtension({ type: 'resetAgentMemory', agentId: targetAgentId });
    setBlocks([]);
  }

  const enabledCount = agents.filter((a) => a.enabled).length;

  if (agents.length === 0) {
    return (
      <div className="chat-empty">
        <p>Todavía no hay agentes configurados.</p>
        <button className="btn-primary" onClick={onGoToTeam}>
          Ir a Equipo
        </button>
      </div>
    );
  }

  return (
    <div className="chat-view">
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
          <button className="btn-icon" onClick={() => setShowHistory((v) => !v)} title="Historial de ejecuciones de equipo">
            <IconClock size={15} />
          </button>
        </div>
        <ModeSelector value={permissionMode} onChange={handlePermissionModeChange} disabled={running} />
      </div>

      {showHistory ? (
        <HistoryPanel
          items={runs}
          emptyLabel="Todavía no hay ejecuciones de equipo guardadas."
          onSelect={(id) => postToExtension({ type: 'openTeamRun', id })}
          onRename={(id, title) => postToExtension({ type: 'renameTeamRun', id, title })}
          onDelete={(id) => postToExtension({ type: 'deleteTeamRun', id })}
        />
      ) : (
        <>
          <div className="chat-log">
            {blocks.length === 0 && (
              <EmptyState icon={<IconUsers size={28} />} title="Chat del equipo" subtitle="Escribí un mensaje para el equipo..." />
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
                    <div className="msg-body">
                      <MarkdownMessage text={b.text} />
                      {!b.done && <span className="cursor" />}
                    </div>
                  </div>
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
          />
        </>
      )}
    </div>
  );
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2);
}
