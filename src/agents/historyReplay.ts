import { randomUUID } from 'crypto';
import { ChatMessage } from './types';
import { ChatStreamEvent } from '../shared/protocol';

export function historyToReplayEvents(history: ChatMessage[]): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [];

  for (const message of history) {
    if (message.role === 'user') {
      events.push({ kind: 'user-message', id: randomUUID(), text: message.content });
    } else if (message.role === 'assistant') {
      const id = randomUUID();
      if (message.content) {
        events.push({ kind: 'assistant-delta', id, textDelta: message.content });
      }
      events.push({ kind: 'assistant-done', id });
      if (message.toolCalls) {
        for (const call of message.toolCalls) {
          events.push({ kind: 'tool-call', callId: call.id, name: call.name, args: call.arguments, needsApproval: false });
        }
      }
    } else if (message.role === 'tool') {
      const callId = message.toolCallId ?? '';
      if (isRejection(message.content)) {
        events.push({ kind: 'tool-rejected', callId, reason: message.content });
      } else {
        events.push({ kind: 'tool-result', callId, result: message.content, isError: message.content.startsWith('Error:') });
      }
    }
  }

  return events;
}

function isRejection(content: string): boolean {
  return content === 'Rechazado por el usuario.' || content.startsWith('Modo Plan:');
}
