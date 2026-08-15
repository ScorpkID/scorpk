import Anthropic from '@anthropic-ai/sdk';
import { ChatMessage, ToolDef } from '../agents/types';
import { ChatEvent, ChatParams, LLMClient } from './llmClient';

const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatEvent, void, unknown> {
    const stream = this.client.messages.stream({
      model: params.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: params.system,
      messages: toAnthropicMessages(params.messages),
      ...(params.tools && params.tools.length > 0
        ? { tools: params.tools.map(toAnthropicTool) }
        : {}),
    });

    const pendingToolUse = new Map<number, { id: string; name: string; partialJson: string }>();

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          pendingToolUse.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            partialJson: '',
          });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text-delta', textDelta: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          const entry = pendingToolUse.get(event.index);
          if (entry) entry.partialJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        const entry = pendingToolUse.get(event.index);
        if (entry) {
          let args: Record<string, unknown> = {};
          try {
            args = entry.partialJson ? JSON.parse(entry.partialJson) : {};
          } catch {
            args = { _raw: entry.partialJson };
          }
          yield { type: 'tool-call', id: entry.id, name: entry.name, arguments: args };
          pendingToolUse.delete(event.index);
        }
      }
    }

    yield { type: 'done' };
  }
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.role === 'system') {
      i++;
      continue;
    }
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      i++;
    } else if (m.role === 'assistant') {
      const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
        }
      }
      out.push({ role: 'assistant', content });
      i++;
    } else {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      while (i < messages.length && messages[i].role === 'tool') {
        const tm = messages[i];
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tm.toolCallId ?? '',
          content: tm.content,
        });
        i++;
      }
      out.push({ role: 'user', content: toolResults });
    }
  }
  return out;
}

function toAnthropicTool(tool: ToolDef): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as unknown as Anthropic.Tool.InputSchema,
  };
}
