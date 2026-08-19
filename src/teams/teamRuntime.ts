import { randomUUID } from 'crypto';
import { AgentDefinition, PermissionMode, TeamStreamEvent } from '../shared/protocol';
import { LLMClient } from '../providers/llmClient';
import { ChatMessage, ToolDef } from '../agents/types';
import { ToolHandler, buildGenerateCommitMessageHandler } from '../agents/tools';
import { runAgent, ApprovalResult } from '../agents/agentRuntime';
import { permissionModeSystemSuffix } from '../agents/permissionMode';
import { withProjectInstructions } from '../agents/projectInstructions';
import { SkillSummary, withSkillsPrompt } from '../skills/skillLoader';

export interface TeamRunDeps {
  getAgentClient: (agent: AgentDefinition) => Promise<{ client: LLMClient; model: string }>;
  tools: ToolDef[];
  toolHandlers: Record<string, ToolHandler>;
  requestApproval: (agentId: string, call: { id: string; name: string; arguments: Record<string, unknown> }) => Promise<ApprovalResult>;
  askUser: (agentId: string, callId: string, question: string, options: string[]) => Promise<string>;
  mode: PermissionMode;
  signal?: AbortSignal;
  projectInstructions?: string;
  skills?: SkillSummary[];
}

export async function* runTeamSequential(
  task: string,
  agents: AgentDefinition[],
  deps: TeamRunDeps,
): AsyncGenerator<TeamStreamEvent, void, unknown> {
  yield { kind: 'run-start', mode: 'pipeline', task };

  if (agents.length === 0) {
    yield { kind: 'run-error', message: 'No hay agentes habilitados con proveedor asignado.' };
    return;
  }

  const transcript: Array<{ agentName: string; role: string; text: string }> = [];

  for (const agent of agents) {
    if (deps.signal?.aborted) {
      yield { kind: 'run-cancelled' };
      return;
    }

    yield { kind: 'agent-start', agentId: agent.id, agentName: agent.name, role: agent.role };

    let client: LLMClient;
    let model: string;
    try {
      ({ client, model } = await deps.getAgentClient(agent));
    } catch (err: any) {
      yield { kind: 'run-error', message: `${agent.name}: ${err?.message ?? String(err)}` };
      return;
    }

    const brief = buildBrief(task, transcript);
    const history: ChatMessage[] = [{ role: 'user', content: brief }];

    let text: string;
    try {
      text = yield* runAgentTurn(agent, client, model, history, deps);
    } catch (err: any) {
      yield { kind: 'run-error', message: `${agent.name}: ${err?.message ?? String(err)}` };
      return;
    }

    if (deps.signal?.aborted) {
      yield { kind: 'run-cancelled' };
      return;
    }

    transcript.push({ agentName: agent.name, role: agent.role, text });
    yield { kind: 'agent-done', agentId: agent.id };
  }

  yield { kind: 'run-done' };
}

export async function* runDirectAgentTurn(
  agent: AgentDefinition,
  text: string,
  history: ChatMessage[],
  deps: TeamRunDeps,
): AsyncGenerator<TeamStreamEvent, void, unknown> {
  yield { kind: 'run-start', mode: 'direct', task: text };
  yield { kind: 'agent-start', agentId: agent.id, agentName: agent.name, role: agent.role };
  yield { kind: 'agent-user-message', agentId: agent.id, id: randomUUID(), text };
  history.push({ role: 'user', content: text });

  let client: LLMClient;
  let model: string;
  try {
    ({ client, model } = await deps.getAgentClient(agent));
  } catch (err: any) {
    yield { kind: 'run-error', message: `${agent.name}: ${err?.message ?? String(err)}` };
    return;
  }

  try {
    yield* runAgentTurn(agent, client, model, history, deps);
  } catch (err: any) {
    yield { kind: 'run-error', message: `${agent.name}: ${err?.message ?? String(err)}` };
    return;
  }

  if (deps.signal?.aborted) {
    yield { kind: 'run-cancelled' };
    return;
  }

  yield { kind: 'agent-done', agentId: agent.id };
  yield { kind: 'run-done' };
}

async function* runAgentTurn(
  agent: AgentDefinition,
  client: LLMClient,
  model: string,
  history: ChatMessage[],
  deps: TeamRunDeps,
): AsyncGenerator<TeamStreamEvent, string, unknown> {
  const textId = randomUUID();
  let text = '';

  for await (const ev of runAgent({
    client,
    model,
    system:
      withSkillsPrompt(withProjectInstructions(agent.systemPrompt, deps.projectInstructions), deps.skills ?? []) +
      permissionModeSystemSuffix(deps.mode),
    history,
    tools: deps.tools,
    // El client/model de acá son los de ESTE agente puntual (cada agente del
    // equipo puede tener un proveedor distinto) — por eso este override no
    // puede armarse una sola vez en teamDeps() para todo el run, tiene que
    // resolverse recién acá.
    toolHandlers: { ...deps.toolHandlers, generate_commit_message: buildGenerateCommitMessageHandler(client, model) },
    requestApproval: (call) => deps.requestApproval(agent.id, call),
    askUser: (callId, question, options) => deps.askUser(agent.id, callId, question, options),
    signal: deps.signal,
  })) {
    if (ev.type === 'text-delta') {
      text += ev.textDelta;
      yield { kind: 'agent-text-delta', agentId: agent.id, id: textId, textDelta: ev.textDelta };
    } else if (ev.type === 'tool-call') {
      yield {
        kind: 'agent-tool-call',
        agentId: agent.id,
        callId: ev.call.id,
        name: ev.call.name,
        args: ev.call.arguments,
        needsApproval: ev.needsApproval,
      };
    } else if (ev.type === 'cancelled') {
      break;
    } else if (ev.type === 'tool-result') {
      yield { kind: 'agent-tool-result', agentId: agent.id, callId: ev.callId, result: ev.result, isError: ev.isError };
    } else if (ev.type === 'tool-rejected') {
      yield { kind: 'agent-tool-rejected', agentId: agent.id, callId: ev.callId, reason: ev.reason };
    } else if (ev.type === 'usage') {
      yield { kind: 'agent-usage', agentId: agent.id, inputTokens: ev.inputTokens, outputTokens: ev.outputTokens };
    } else if (ev.type === 'done') {
      yield { kind: 'agent-text-done', agentId: agent.id, id: textId };
    }
  }

  return text;
}

function buildBrief(task: string, transcript: Array<{ agentName: string; role: string; text: string }>): string {
  let brief = `Tarea del usuario: ${task}`;
  if (transcript.length > 0) {
    brief +=
      '\n\nContexto de los agentes anteriores del equipo:\n\n' +
      transcript.map((t) => `### ${t.agentName} (${t.role})\n${t.text}`).join('\n\n');
  }
  brief +=
    '\n\nActuá según tu rol y continuá el trabajo del equipo. Usá las herramientas disponibles si necesitás ' +
    'leer o modificar el workspace.';
  return brief;
}
