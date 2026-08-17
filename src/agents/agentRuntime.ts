import { LLMClient } from '../providers/llmClient';
import { ChatMessage, ToolCall, ToolDef } from './types';
import { ToolHandler, ASK_USER_TOOL_NAME } from './tools';

export type AgentEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call'; call: ToolCall; needsApproval: boolean }
  | { type: 'tool-result'; callId: string; result: string; isError: boolean }
  | { type: 'tool-rejected'; callId: string; reason?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'cancelled' }
  | { type: 'done' };

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
}

export interface RunAgentOptions {
  client: LLMClient;
  model: string;
  system: string;
  history: ChatMessage[];
  tools: ToolDef[];
  toolHandlers: Record<string, ToolHandler>;
  requestApproval: (call: ToolCall) => Promise<ApprovalResult>;
  askUser?: (callId: string, question: string, options: string[]) => Promise<string>;
  signal?: AbortSignal;
}

const MAX_TURNS = 12;

// Tools de archivo que se pueden previsualizar/aprobar juntas en un lote
// (ver ChatView.tsx, barra de "Aprobar todo"). Deliberadamente no incluye
// run_terminal_command/git_commit/etc — esas siguen una por una.
const BATCHABLE_FILE_TOOLS = new Set(['write_file', 'edit_file', 'delete_file', 'move_file']);

// Todas las rutas que una llamada toca — para move_file son DOS (origen y
// destino). Antes solo se consideraba `from`, así que un lote podía incluir
// move_file(from=A, to=B) seguido de un edit_file/delete_file sobre B sin
// cortar el lote — el diff/checkpoint de esa segunda llamada se calculaba
// contra el estado de B antes de que el move la creara (stale), porque
// todo el lote se previsualiza antes de ejecutar cualquiera.
function callPaths(call: ToolCall): string[] {
  const args = call.arguments;
  const paths: string[] = [];
  if (typeof args.path === 'string') paths.push(args.path);
  if (typeof args.from === 'string') paths.push(args.from);
  if (typeof args.to === 'string') paths.push(args.to);
  return paths;
}

export async function* runAgent(opts: RunAgentOptions): AsyncGenerator<AgentEvent, void, unknown> {
  const { client, model, system, history, tools, toolHandlers, requestApproval, askUser, signal } = opts;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) {
      yield { type: 'cancelled' };
      return;
    }

    let assistantText = '';
    const pendingToolCalls: ToolCall[] = [];

    try {
      for await (const ev of client.chat({ model, system, messages: history, tools, signal })) {
        if (ev.type === 'text-delta') {
          assistantText += ev.textDelta;
          yield { type: 'text-delta', textDelta: ev.textDelta };
        } else if (ev.type === 'tool-call') {
          pendingToolCalls.push({ id: ev.id, name: ev.name, arguments: ev.arguments });
        } else if (ev.type === 'usage') {
          yield { type: 'usage', inputTokens: ev.inputTokens, outputTokens: ev.outputTokens };
        }
      }
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') {
        yield { type: 'cancelled' };
        return;
      }
      throw err;
    }

    history.push({
      role: 'assistant',
      content: assistantText,
      toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
    });

    if (pendingToolCalls.length === 0) {
      yield { type: 'done' };
      return;
    }

    const runApprovedCall = async (call: ToolCall): Promise<{ result: string; isError: boolean }> => {
      try {
        if (call.name === ASK_USER_TOOL_NAME && askUser) {
          const question = String(call.arguments.question ?? '');
          const options = Array.isArray(call.arguments.options) ? call.arguments.options.map(String) : [];
          return { result: await askUser(call.id, question, options), isError: false };
        }
        const handler = toolHandlers[call.name];
        if (!handler) return { result: `Tool desconocida: ${call.name}`, isError: true };
        return { result: await handler(call.arguments), isError: false };
      } catch (err: any) {
        return { result: `Error: ${err?.message ?? String(err)}`, isError: true };
      }
    };

    let i = 0;
    while (i < pendingToolCalls.length) {
      if (signal?.aborted) {
        yield { type: 'cancelled' };
        return;
      }

      // Arma un lote de llamadas consecutivas de archivo, con aprobación
      // requerida, sobre paths distintos entre sí — se muestran todas juntas
      // para revisión antes de ejecutar ninguna. Cualquier otra tool (o un
      // path repetido) corta el lote ahí, sin cambiar su comportamiento.
      const batch: ToolCall[] = [];
      const seenPaths = new Set<string>();
      let j = i;
      while (j < pendingToolCalls.length) {
        const call = pendingToolCalls[j];
        const toolDef = tools.find((t) => t.name === call.name);
        const needsApproval = toolDef?.requiresApproval ?? true;
        if (!needsApproval || !BATCHABLE_FILE_TOOLS.has(call.name)) break;
        const paths = callPaths(call);
        if (paths.length === 0 || paths.some((p) => seenPaths.has(p))) break;
        for (const p of paths) seenPaths.add(p);
        batch.push(call);
        j++;
      }

      if (batch.length > 0) {
        for (const call of batch) {
          yield { type: 'tool-call', call, needsApproval: true };
        }
        for (const call of batch) {
          if (signal?.aborted) {
            yield { type: 'cancelled' };
            return;
          }
          const { approved, reason } = await requestApproval(call);
          if (!approved) {
            const rejectionMessage = reason ?? 'Rechazado por el usuario.';
            history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: rejectionMessage });
            yield { type: 'tool-rejected', callId: call.id, reason };
            continue;
          }
          const { result, isError } = await runApprovedCall(call);
          history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
          yield { type: 'tool-result', callId: call.id, result, isError };
        }
        i = j;
        continue;
      }

      const call = pendingToolCalls[i];
      i++;

      const toolDef = tools.find((t) => t.name === call.name);
      const needsApproval = toolDef?.requiresApproval ?? true;
      yield { type: 'tool-call', call, needsApproval };

      const { approved, reason } = needsApproval ? await requestApproval(call) : { approved: true, reason: undefined };
      if (!approved) {
        const rejectionMessage = reason ?? 'Rechazado por el usuario.';
        history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: rejectionMessage });
        yield { type: 'tool-rejected', callId: call.id, reason };
        continue;
      }

      const { result, isError } = await runApprovedCall(call);
      history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
      yield { type: 'tool-result', callId: call.id, result, isError };
    }
  }

  yield { type: 'done' };
}
