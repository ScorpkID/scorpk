import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { ChatMessage } from '../agents/types';
import { ConversationSummary } from '../shared/protocol';
import { estimateCostUsd } from '../providers/modelPricing';

interface StoredUsage {
  inputTokens: number;
  outputTokens: number;
}

interface StoredConversation {
  id: string;
  title: string;
  titleIsCustom: boolean;
  providerId: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  history: ChatMessage[];
  usage?: StoredUsage;
}

const CONVERSATIONS_KEY = 'scorpk.conversations';
const ACTIVE_ID_KEY = 'scorpk.activeConversationId';
const TITLE_MAX_LENGTH = 48;

export class ConversationStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private listRaw(): StoredConversation[] {
    return this.context.workspaceState.get<StoredConversation[]>(CONVERSATIONS_KEY, []);
  }

  private async saveRaw(conversations: StoredConversation[]): Promise<void> {
    await this.context.workspaceState.update(CONVERSATIONS_KEY, conversations);
  }

  list(): ConversationSummary[] {
    return this.listRaw()
      .map((c) => ({
        id: c.id,
        title: c.title,
        providerId: c.providerId,
        model: c.model,
        updatedAt: c.updatedAt,
        usage: c.usage
          ? {
              inputTokens: c.usage.inputTokens,
              outputTokens: c.usage.outputTokens,
              costUsd: estimateCostUsd(c.model, c.usage.inputTokens, c.usage.outputTokens),
            }
          : undefined,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async addUsage(id: string, inputTokens: number, outputTokens: number): Promise<void> {
    if (inputTokens <= 0 && outputTokens <= 0) return;
    const conversations = this.listRaw();
    const conversation = conversations.find((c) => c.id === id);
    if (!conversation) return;
    const current = conversation.usage ?? { inputTokens: 0, outputTokens: 0 };
    conversation.usage = {
      inputTokens: current.inputTokens + inputTokens,
      outputTokens: current.outputTokens + outputTokens,
    };
    await this.saveRaw(conversations);
  }

  getHistory(id: string): ChatMessage[] | undefined {
    return this.listRaw().find((c) => c.id === id)?.history;
  }

  getActiveId(): string | null {
    const id = this.context.workspaceState.get<string>(ACTIVE_ID_KEY);
    if (!id) return null;
    return this.listRaw().some((c) => c.id === id) ? id : null;
  }

  async setActiveId(id: string | null): Promise<void> {
    await this.context.workspaceState.update(ACTIVE_ID_KEY, id ?? undefined);
  }

  async create(providerId: string, model: string): Promise<string> {
    const conversations = this.listRaw();
    const now = Date.now();
    const conversation: StoredConversation = {
      id: randomUUID(),
      title: 'Nueva conversación',
      titleIsCustom: false,
      providerId,
      model,
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    conversations.push(conversation);
    await this.saveRaw(conversations);
    await this.setActiveId(conversation.id);
    return conversation.id;
  }

  async saveTurn(id: string, providerId: string, model: string, history: ChatMessage[]): Promise<void> {
    const conversations = this.listRaw();
    const conversation = conversations.find((c) => c.id === id);
    if (!conversation) return;
    conversation.providerId = providerId;
    conversation.model = model;
    conversation.history = history;
    conversation.updatedAt = Date.now();
    if (!conversation.titleIsCustom) {
      const firstUserMessage = history.find((m) => m.role === 'user');
      if (firstUserMessage) {
        conversation.title = deriveTitle(firstUserMessage.content);
      }
    }
    await this.saveRaw(conversations);
  }

  async rename(id: string, title: string): Promise<void> {
    const conversations = this.listRaw();
    const conversation = conversations.find((c) => c.id === id);
    if (!conversation) return;
    conversation.title = title.trim().slice(0, TITLE_MAX_LENGTH) || conversation.title;
    conversation.titleIsCustom = true;
    await this.saveRaw(conversations);
  }

  async remove(id: string): Promise<void> {
    await this.saveRaw(this.listRaw().filter((c) => c.id !== id));
    if (this.getActiveId() === id) {
      await this.setActiveId(null);
    }
  }
}

function deriveTitle(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > TITLE_MAX_LENGTH ? singleLine.slice(0, TITLE_MAX_LENGTH - 1) + '…' : singleLine || 'Nueva conversación';
}
