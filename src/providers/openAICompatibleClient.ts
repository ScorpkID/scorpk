import { ChatMessage, ToolDef } from '../agents/types';
import { ChatEvent, ChatParams, LLMClient } from './llmClient';

interface OpenAIToolCallAccumulator {
  id: string;
  name: string;
  argumentsJson: string;
}

export class OpenAICompatibleClient implements LLMClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  async *chat(params: ChatParams): AsyncGenerator<ChatEvent, void, unknown> {
    const body = {
      model: params.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: toOpenAIMessages(params.system, params.messages),
      ...(params.tools && params.tools.length > 0
        ? { tools: params.tools.map(toOpenAITool), tool_choice: 'auto' }
        : {}),
    };

    const response = await fetch(joinUrl(this.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok || !response.body) {
      const text = await safeReadText(response);
      throw new Error(`Error del proveedor (${response.status}): ${text || response.statusText}`);
    }

    const toolCalls = new Map<number, OpenAIToolCallAccumulator>();
    const decoder = new TextDecoder();
    let buffer = '';
    let outputText = '';
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;

        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        if (parsed.usage) {
          usage = { inputTokens: parsed.usage.prompt_tokens ?? 0, outputTokens: parsed.usage.completion_tokens ?? 0 };
        }

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          outputText += delta.content;
          yield { type: 'text-delta', textDelta: delta.content };
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            const existing = toolCalls.get(index) ?? { id: '', name: '', argumentsJson: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.argumentsJson += tc.function.arguments;
            toolCalls.set(index, existing);
          }
        }
      }
    }

    for (const call of toolCalls.values()) {
      let args: Record<string, unknown> = {};
      try {
        args = call.argumentsJson ? JSON.parse(call.argumentsJson) : {};
      } catch {
        args = { _raw: call.argumentsJson };
      }
      yield { type: 'tool-call', id: call.id || `call_${call.name}`, name: call.name, arguments: args };
    }

    // Varios proveedores OpenAI-compatible ignoran stream_options.include_usage
    // y nunca mandan el campo `usage` — sin este fallback el contador de
    // tokens quedaba siempre en cero para esos casos. Es una estimación
    // aproximada (caracteres / 4), no un conteo real de tokens.
    if (usage) {
      yield { type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    } else {
      const inputChars = JSON.stringify(body.messages).length;
      yield { type: 'usage', inputTokens: estimateTokensFromChars(inputChars), outputTokens: estimateTokensFromChars(outputText.length) };
    }

    yield { type: 'done' };
  }
}

function toOpenAIMessages(system: string | undefined, messages: ChatMessage[]) {
  const out: any[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function toOpenAITool(tool: ToolDef) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

function estimateTokensFromChars(chars: number): number {
  return Math.max(0, Math.round(chars / 4));
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
