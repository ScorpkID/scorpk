import { ChatMessage, ToolDef } from '../agents/types';

export type ChatEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done' };

export interface ChatParams {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
}

export interface LLMClient {
  chat(params: ChatParams): AsyncGenerator<ChatEvent, void, unknown>;
}
