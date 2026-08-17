import * as vscode from 'vscode';
import { ChatMessage, ToolDef } from '../agents/types';
import { ChatEvent, ChatParams, LLMClient } from './llmClient';

/**
 * Usa el modelo de Copilot que el usuario ya tiene habilitado en VS Code
 * (API nativa vscode.lm), sin ninguna API key propia. La primera vez que se
 * llama a selectChatModels, VS Code le pide consentimiento al usuario para
 * que esta extensión pueda usar Copilot — por eso la detección inicial se
 * dispara desde un botón explícito ("Detectar") y no automáticamente.
 */
export class VscodeLmClient implements LLMClient {
  async *chat(params: ChatParams): AsyncGenerator<ChatEvent, void, unknown> {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (models.length === 0) {
      throw new Error('No se encontró ningún modelo de GitHub Copilot disponible. Asegurate de tener Copilot activo en VS Code.');
    }
    const model = models.find((m) => m.id === params.model || m.family === params.model) ?? models[0];

    const messages = toLmMessages(params.system, params.messages);
    const tools: vscode.LanguageModelChatTool[] | undefined =
      params.tools && params.tools.length > 0 ? params.tools.map(toLmTool) : undefined;

    const cts = new vscode.CancellationTokenSource();
    const onAbort = () => cts.cancel();
    if (params.signal) {
      if (params.signal.aborted) cts.cancel();
      else params.signal.addEventListener('abort', onAbort, { once: true });
    }

    let outputText = '';
    try {
      const response = await model.sendRequest(messages, { tools }, cts.token);
      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          if (part.value) {
            outputText += part.value;
            yield { type: 'text-delta', textDelta: part.value };
          }
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          yield { type: 'tool-call', id: part.callId, name: part.name, arguments: part.input as Record<string, unknown> };
        }
      }
    } finally {
      if (params.signal) params.signal.removeEventListener('abort', onAbort);
      cts.dispose();
    }

    // La API vscode.lm no expone el consumo real de una request, pero sí
    // countTokens (con el tokenizador del propio modelo) — lo usamos para no
    // dejar el contador de uso siempre en cero con Copilot.
    try {
      const inputText = [params.system, ...params.messages.map((m) => m.content)].filter(Boolean).join('\n');
      const [inputTokens, outputTokens] = await Promise.all([
        model.countTokens(inputText),
        outputText ? model.countTokens(outputText) : Promise.resolve(0),
      ]);
      yield { type: 'usage', inputTokens, outputTokens };
    } catch {
      // No crítico — si countTokens falla, seguimos sin usage para este turno.
    }

    yield { type: 'done' };
  }
}

function toLmMessages(system: string | undefined, messages: ChatMessage[]): vscode.LanguageModelChatMessage[] {
  const out: vscode.LanguageModelChatMessage[] = [];
  if (system) out.push(vscode.LanguageModelChatMessage.User(system));
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      out.push(vscode.LanguageModelChatMessage.User(m.content));
    } else if (m.role === 'assistant') {
      const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
      if (m.content) parts.push(new vscode.LanguageModelTextPart(m.content));
      for (const tc of m.toolCalls ?? []) {
        parts.push(new vscode.LanguageModelToolCallPart(tc.id, tc.name, tc.arguments));
      }
      out.push(vscode.LanguageModelChatMessage.Assistant(parts));
    } else if (m.role === 'tool') {
      out.push(
        vscode.LanguageModelChatMessage.User([
          new vscode.LanguageModelToolResultPart(m.toolCallId ?? '', [new vscode.LanguageModelTextPart(m.content)]),
        ]),
      );
    }
  }
  return out;
}

function toLmTool(tool: ToolDef): vscode.LanguageModelChatTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
  };
}
