import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { AgentDefinition, NewAgentInput } from '../shared/protocol';
import { BUILT_IN_AGENTS } from './builtInAgents';

const AGENTS_KEY = 'scorpk.agents';

export class TeamStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): AgentDefinition[] {
    const agents = this.context.globalState.get<AgentDefinition[]>(AGENTS_KEY);
    if (!agents || agents.length === 0) {
      const seeded = BUILT_IN_AGENTS.map((a) => ({ ...a, id: randomUUID() }));
      void this.context.globalState.update(AGENTS_KEY, seeded);
      return seeded;
    }
    return [...agents].sort((a, b) => a.order - b.order);
  }

  get(id: string): AgentDefinition | undefined {
    return this.list().find((a) => a.id === id);
  }

  private async save(agents: AgentDefinition[]): Promise<void> {
    await this.context.globalState.update(AGENTS_KEY, agents);
  }

  async add(input: NewAgentInput): Promise<AgentDefinition> {
    const agents = this.list();
    const maxOrder = agents.reduce((max, a) => Math.max(max, a.order), -1);
    const agent: AgentDefinition = { ...input, id: randomUUID(), builtIn: false, order: maxOrder + 1 };
    agents.push(agent);
    await this.save(agents);
    return agent;
  }

  async update(agent: AgentDefinition): Promise<void> {
    const agents = this.list();
    const idx = agents.findIndex((a) => a.id === agent.id);
    if (idx === -1) {
      throw new Error(`Agente no encontrado: ${agent.id}`);
    }
    agents[idx] = { ...agent, builtIn: agents[idx].builtIn };
    await this.save(agents);
  }

  async remove(id: string): Promise<void> {
    const agents = this.list();
    const agent = agents.find((a) => a.id === id);
    if (agent?.builtIn) {
      throw new Error('Los agentes predefinidos no se pueden eliminar, solo desactivar.');
    }
    await this.save(agents.filter((a) => a.id !== id));
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const agents = this.list();
    const byId = new Map(agents.map((a) => [a.id, a]));
    orderedIds.forEach((id, index) => {
      const agent = byId.get(id);
      if (agent) agent.order = index;
    });
    await this.save(Array.from(byId.values()));
  }
}
