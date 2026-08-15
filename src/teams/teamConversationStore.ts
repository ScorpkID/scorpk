import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { ChatMessage } from '../agents/types';
import { TeamRunSummary, TeamStreamEvent } from '../shared/protocol';

interface StoredPipelineRun {
  id: string;
  title: string;
  titleIsCustom: boolean;
  createdAt: number;
  updatedAt: number;
  events: TeamStreamEvent[];
}

const RUNS_KEY = 'scorpk.teamRuns';
const AGENT_HISTORIES_KEY = 'scorpk.teamAgentHistories';
const TITLE_MAX_LENGTH = 48;

export class TeamConversationStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private listRaw(): StoredPipelineRun[] {
    return this.context.workspaceState.get<StoredPipelineRun[]>(RUNS_KEY, []);
  }

  private async saveRaw(runs: StoredPipelineRun[]): Promise<void> {
    await this.context.workspaceState.update(RUNS_KEY, runs);
  }

  list(): TeamRunSummary[] {
    return this.listRaw()
      .map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getEvents(id: string): TeamStreamEvent[] | undefined {
    return this.listRaw().find((r) => r.id === id)?.events;
  }

  async saveRun(task: string, events: TeamStreamEvent[]): Promise<string> {
    const runs = this.listRaw();
    const now = Date.now();
    const run: StoredPipelineRun = {
      id: randomUUID(),
      title: deriveTitle(task),
      titleIsCustom: false,
      createdAt: now,
      updatedAt: now,
      events,
    };
    runs.push(run);
    await this.saveRaw(runs);
    return run.id;
  }

  async rename(id: string, title: string): Promise<void> {
    const runs = this.listRaw();
    const run = runs.find((r) => r.id === id);
    if (!run) return;
    run.title = title.trim().slice(0, TITLE_MAX_LENGTH) || run.title;
    run.titleIsCustom = true;
    await this.saveRaw(runs);
  }

  async remove(id: string): Promise<void> {
    await this.saveRaw(this.listRaw().filter((r) => r.id !== id));
  }

  getAgentHistories(): Record<string, ChatMessage[]> {
    return this.context.workspaceState.get<Record<string, ChatMessage[]>>(AGENT_HISTORIES_KEY, {});
  }

  async saveAgentHistories(histories: Record<string, ChatMessage[]>): Promise<void> {
    await this.context.workspaceState.update(AGENT_HISTORIES_KEY, histories);
  }
}

function deriveTitle(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > TITLE_MAX_LENGTH ? singleLine.slice(0, TITLE_MAX_LENGTH - 1) + '…' : singleLine || 'Tarea de equipo';
}
