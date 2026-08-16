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

    for (const call of pendingToolCalls) {
      if (signal?.aborted) {
        yield { type: 'cancelled' };
        return;
      }

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

      let result: string;
      let isError = false;
      try {
        if (call.name === ASK_USER_TOOL_NAME && askUser) {
          const question = String(call.arguments.question ?? '');
          const options = Array.isArray(call.arguments.options) ? call.arguments.options.map(String) : [];
          result = await askUser(call.id, question, options);
        } else {
          const handler = toolHandlers[call.name];
          result = handler ? await handler(call.arguments) : `Tool desconocida: ${call.name}`;
          if (!handler) isError = true;
        }
      } catch (err: any) {
        result = `Error: ${err?.message ?? String(err)}`;
        isError = true;
      }

      history.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
      yield { type: 'tool-result', callId: call.id, result, isError };
    }
  }

  yield { type: 'done' };
}
