import { useEffect, useRef, useState } from 'react';
import { ChatStreamEvent, ConversationSummary, ModelsSource, PermissionMode, ProviderConfig } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage, requestAutoModeConfirmation } from '../vscodeApi';
import { ToolCallLog, ToolBlock } from './ToolCallLog';
import { MarkdownMessage } from './MarkdownMessage';
import { ModeSelector } from './ModeSelector';
import { ModelPicker } from './ModelPicker';
import { HistoryPanel } from './HistoryPanel';
import { ViewHeader } from './ViewHeader';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';
import { IconClock, IconX } from './Icon';
import { LOGO_URI } from '../logo';

interface Props {
  providers: ProviderConfig[];
  onGoToProviders: () => void;
  username: string;
}

export type Block =
  | { type: 'user'; id: string; text: string }
  | { type: 'assistant'; id: string; text: string; done: boolean }
  | ({ type: 'tool' } & ToolBlock)
  | { type: 'error'; id: string; text: string };

export function applyChatEvent(blocks: Block[], ev: ChatStreamEvent): Block[] {
  switch (ev.kind) {
    case 'user-message':
      return [...blocks, { type: 'user', id: ev.id, text: ev.text }];
    case 'assistant-delta': {
      const idx = blocks.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1) return [...blocks, { type: 'assistant', id: ev.id, text: ev.textDelta, done: false }];
      const copy = [...blocks];
      const block = copy[idx] as { type: 'assistant'; id: string; text: string; done: boolean };
      copy[idx] = { ...block, text: block.text + ev.textDelta };
      return copy;
    }
    case 'assistant-done': {
      const idx = blocks.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as { type: 'assistant'; id: string; text: string; done: boolean };
      copy[idx] = { ...block, done: true };
      return copy;
    }
    case 'tool-call':
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
    case 'tool-result': {
      const idx = blocks.findIndex((b) => b.type === 'tool' && b.callId === ev.callId);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as ToolBlock & { type: 'tool' };
      copy[idx] = { ...block, status: ev.isError ? 'error' : 'done', result: ev.result };
      return copy;
    }
    case 'tool-rejected': {
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
    case 'run-done':
      return blocks;
    default:
      return blocks;
  }
}

export function ChatView({ providers, onGoToProviders, username }: Props) {
  const [providerId, setProviderId] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [mode, setMode] = useState<PermissionMode>('manual');
  const [input, setInput] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!providerId && providers.length > 0) {
      setProviderId(providers[0].id);
      setModel(providers[0].defaultModel ?? '');
    }
  }, [providers, providerId]);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'error') {
        setBlocks((prev) => [...prev, { type: 'error', id: cryptoId(), text: message.message }]);
        setRunning(false);
        return;
      }
      if (message.type === 'conversations') {
        setConversations(message.conversations);
        setActiveId(message.activeId);
        return;
      }
      if (message.type === 'conversationLoaded') {
        setActiveId(message.id);
        setBlocks(message.events.reduce(applyChatEvent, [] as Block[]));
        setRunning(false);
        setShowHistory(false);
        return;
      }
      if (message.type !== 'chatEvent') return;
      const ev = message.event;
      setBlocks((prev) => applyChatEvent(prev, ev));
      if (ev.kind === 'run-done' || ev.kind === 'run-error' || ev.kind === 'run-cancelled') setRunning(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [blocks]);

  function send() {
    const text = input.trim();
    if (!text || !providerId || running) return;
    setRunning(true);
    setInput('');
    postToExtension({ type: 'sendMessage', providerId, model: model.trim(), text, mode });
  }

  function cancel() {
    postToExtension({ type: 'cancelRun' });
  }

  async function handleModeChange(next: PermissionMode) {
    if (next === 'auto' && mode !== 'auto') {
      const confirmed = await requestAutoModeConfirmation();
      if (!confirmed) return;
    }
    setMode(next);
  }

  function newConversation() {
    postToExtension({ type: 'newConversation' });
  }

  const modelsSource: ModelsSource | undefined = providerId ? { kind: 'saved', providerId } : undefined;

  if (providers.length === 0) {
    return (
      <div className="view">
        <ViewHeader title="Agente" subtitle="Tu asistente inteligente para desarrollo" />
        <div className="chat-empty">
          <p>Todavía no configuraste ningún proveedor.</p>
          <button className="btn-primary" onClick={onGoToProviders}>
            Ir a Proveedores
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="view chat-view">
      <ViewHeader title="Agente" subtitle="Tu asistente inteligente para desarrollo" />

      <div className="agent-config">
        <div className="agent-config-row">
          <select className="model-select" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="toolbar-spacer" />
          <button className="btn-icon" onClick={() => setShowHistory((v) => !v)} title="Historial de conversaciones">
            {showHistory ? <IconX size={15} /> : <IconClock size={15} />}
          </button>
        </div>
        <ModelPicker
          key={providerId}
          value={model}
          onChange={setModel}
          source={modelsSource}
          placeholder="modelo (ej: gpt-4o, claude-sonnet-4-5)"
        />
        <ModeSelector value={mode} onChange={handleModeChange} disabled={running} />
      </div>

      {showHistory ? (
        <HistoryPanel
          items={conversations}
          activeId={activeId}
          emptyLabel="Todavía no hay conversaciones guardadas."
          onSelect={(id) => postToExtension({ type: 'openConversation', id })}
          onNew={newConversation}
          onRename={(id, title) => postToExtension({ type: 'renameConversation', id, title })}
          onDelete={(id) => postToExtension({ type: 'deleteConversation', id })}
        />
      ) : (
        <>
          <div className="chat-log">
            {blocks.length === 0 && (
              <EmptyState
                icon={<img src={LOGO_URI} alt="" className="empty-state-logo" />}
                title={`Hola, ${username}`}
                subtitle="¿En qué puedo ayudarte hoy?"
              />
            )}
            {blocks.map((b) => {
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
                    <span className="msg-label">Scorpk</span>
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
            placeholder="Escribí un mensaje para Scorpk..."
          />
        </>
      )}
    </div>
  );
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2);
}
