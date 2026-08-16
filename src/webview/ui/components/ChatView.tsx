import { useEffect, useRef, useState } from 'react';
import { AttachmentRef, ChatStreamEvent, ConversationSummary, ModelsSource, PermissionMode, ProviderConfig } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage, requestAutoModeConfirmation } from '../vscodeApi';
import { ToolCallLog, ToolBlock, formatDuration } from './ToolCallLog';
import { AskUserCard } from './AskUserCard';
import { MarkdownMessage } from './MarkdownMessage';
import { ModeSelector } from './ModeSelector';
import { ModelPicker } from './ModelPicker';
import { HistoryPanel } from './HistoryPanel';
import { ViewHeader } from './ViewHeader';
import { EmptyState } from './EmptyState';
import { Composer } from './Composer';
import { ThinkingIndicator } from './ThinkingIndicator';
import { IconClock, IconPlus, IconRefresh, IconX } from './Icon';
import { LOGO_URI } from '../logo';
import { formatTokens, formatCost } from './SettingsView';

const ASK_USER_TOOL_NAME = 'ask_user';

interface Props {
  providers: ProviderConfig[];
  onGoToProviders: () => void;
  username: string;
}

export type Block =
  | { type: 'user'; id: string; text: string }
  | { type: 'assistant'; id: string; text: string; done: boolean; startedAt: number; durationMs?: number }
  | ({ type: 'tool' } & ToolBlock)
  | { type: 'thinking'; id: string }
  | { type: 'error'; id: string; text: string };

function withoutThinking(blocks: Block[]): Block[] {
  return blocks.filter((b) => b.type !== 'thinking');
}

export function applyChatEvent(blocks: Block[], ev: ChatStreamEvent): Block[] {
  switch (ev.kind) {
    case 'user-message':
      return [...blocks, { type: 'user', id: ev.id, text: ev.text }, { type: 'thinking', id: cryptoId() }];
    case 'assistant-delta': {
      const base = withoutThinking(blocks);
      const idx = base.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1)
        return [...base, { type: 'assistant', id: ev.id, text: ev.textDelta, done: false, startedAt: Date.now() }];
      const copy = [...base];
      const block = copy[idx] as Extract<Block, { type: 'assistant' }>;
      copy[idx] = { ...block, text: block.text + ev.textDelta };
      return copy;
    }
    case 'assistant-done': {
      const idx = blocks.findIndex((b) => b.type === 'assistant' && b.id === ev.id);
      if (idx === -1) return blocks;
      const copy = [...blocks];
      const block = copy[idx] as Extract<Block, { type: 'assistant' }>;
      copy[idx] = { ...block, done: true, durationMs: Date.now() - block.startedAt };
      return copy;
    }
    case 'tool-call':
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
    case 'tool-result': {
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
    case 'tool-rejected': {
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
    case 'run-done':
      return withoutThinking(blocks);
    default:
      return blocks;
  }
}

export function ChatView({ providers, onGoToProviders, username }: Props) {
  const [providerId, setProviderId] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [mode, setMode] = useState<PermissionMode>('manual');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // "Latest ref": el listener de mensajes de abajo se suscribe una sola vez
  // (deps []), así que si leyera providerId/model/mode/running directamente
  // vería siempre los valores del primer render. Este ref se actualiza en
  // cada render y el listener lee de acá para tener siempre el valor actual.
  const latestRef = useRef({ providerId, model, mode, running });
  latestRef.current = { providerId, model, mode, running };

  function sendFromEditor(text: string) {
    const { providerId: pid, model: mdl, mode: md, running: run } = latestRef.current;
    if (!pid || run) {
      setInput(text);
      return;
    }
    setRunning(true);
    postToExtension({ type: 'sendMessage', providerId: pid, model: mdl.trim(), text, mode: md, attachments: undefined });
  }

  useEffect(() => {
    if (!providerId && providers.length > 0) {
      setProviderId(providers[0].id);
      setModel(providers[0].defaultModel ?? '');
    }
  }, [providers, providerId]);

  // Red de seguridad para cuando el webview se recrea (VS Code lo hace al
  // salir del panel de Scorpk y volver): si nos enteramos de que hay una
  // conversación activa pero todavía no tenemos sus mensajes cargados, la
  // pedimos explícitamente en vez de depender solo del push automático del
  // handshake 'ready' — así el chat no queda "vacío" aunque ese push se
  // haya perdido o llegado en un orden raro.
  useEffect(() => {
    if (activeId && blocks.length === 0) {
      postToExtension({ type: 'openConversation', id: activeId });
    }
  }, [activeId]);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'error') {
        setBlocks((prev) => [...withoutThinking(prev), { type: 'error', id: cryptoId(), text: message.message }]);
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
      if (message.type === 'chatRunState') {
        // El webview puede haberse recreado mientras había una ejecución en
        // curso — esto reconecta la UI a lo que sigue pasando del lado del
        // extension host, en vez de mostrarse "cortado".
        setRunning(message.running);
        if (message.running && message.assistantId && message.partialText) {
          setBlocks((prev) =>
            applyChatEvent(prev, { kind: 'assistant-delta', id: message.assistantId!, textDelta: message.partialText! }),
          );
        } else if (message.running) {
          setBlocks((prev) => (prev.some((b) => b.type === 'thinking') ? prev : [...prev, { type: 'thinking', id: cryptoId() }]));
        }
        return;
      }
      if (message.type === 'runFromEditor') {
        sendFromEditor(message.text);
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
    const currentAttachments = attachments;
    setAttachments([]);
    postToExtension({
      type: 'sendMessage',
      providerId,
      model: model.trim(),
      text,
      mode,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
    });
  }

  function cancel() {
    postToExtension({ type: 'cancelRun', scope: 'chat' });
  }

  function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    // Siempre refrescamos al abrir, en vez de confiar en que la lista que
    // llegó por push en algún momento anterior siga al día — evita que una
    // conversación en curso "no aparezca" si ese push se perdió.
    if (next) postToExtension({ type: 'listConversations' });
  }

  async function handleModeChange(next: PermissionMode) {
    if (next === 'auto' && mode !== 'auto') {
      const confirmed = await requestAutoModeConfirmation();
      if (!confirmed) return;
    }
    setMode(next);
  }

  function newConversation() {
    setBlocks([]);
    postToExtension({ type: 'newConversation' });
  }

  const modelsSource: ModelsSource | undefined = providerId ? { kind: 'saved', providerId } : undefined;
  const activeUsage = conversations.find((c) => c.id === activeId)?.usage;

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
          {activeUsage && (activeUsage.inputTokens > 0 || activeUsage.outputTokens > 0) && (
            <span className="chat-usage-badge" title="Tokens usados en esta conversación">
              {formatTokens(activeUsage.inputTokens)} in · {formatTokens(activeUsage.outputTokens)} out
              {activeUsage.costUsd !== undefined ? ` · ${formatCost(activeUsage.costUsd)}` : ''}
            </span>
          )}
          <span className="toolbar-spacer" />
          <button className="btn-icon" onClick={newConversation} title="Nueva conversación">
            <IconPlus size={15} />
          </button>
          <button className="btn-icon" onClick={toggleHistory} title="Historial de conversaciones">
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
                    <span className="msg-label">
                      Vos
                      {activeId && (
                        <button
                          type="button"
                          className="btn-icon msg-revert"
                          title="Revertir archivos a como estaban antes de este mensaje"
                          onClick={() => postToExtension({ type: 'revertToCheckpoint', conversationId: activeId, messageId: b.id })}
                        >
                          <IconRefresh size={12} />
                        </button>
                      )}
                    </span>
                    <div className="msg-body">{b.text}</div>
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
              if (b.type === 'assistant') {
                return (
                  <div key={b.id} className="msg-row role-assistant">
                    <span className="msg-label">
                      Scorpk
                      {b.durationMs !== undefined && <span className="msg-duration">· {formatDuration(b.durationMs)}</span>}
                    </span>
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
            placeholder="Escribí un mensaje para Scorpk..."
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
