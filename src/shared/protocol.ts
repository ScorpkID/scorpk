export type ProviderKind = 'openai-compatible' | 'anthropic';

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel?: string;
  hasApiKey: boolean;
}

export type NewProviderInput = Omit<ProviderConfig, 'id' | 'hasApiKey'>;

export interface ToolCallView {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  provider?: string;
  free: boolean;
}

export type ModelsSource =
  | { kind: 'draft'; providerKind: ProviderKind; baseUrl?: string; apiKey: string }
  | { kind: 'saved'; providerId: string };

export type PermissionMode = 'manual' | 'auto-edit' | 'plan' | 'auto';

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  providerId: string;
  model: string;
  enabled: boolean;
  builtIn: boolean;
  order: number;
}

export type NewAgentInput = Omit<AgentDefinition, 'id' | 'builtIn' | 'order'>;

export type TeamStreamEvent =
  | { kind: 'run-start'; mode: 'pipeline' | 'direct'; task: string }
  | { kind: 'agent-start'; agentId: string; agentName: string; role: string }
  | { kind: 'agent-user-message'; agentId: string; id: string; text: string }
  | { kind: 'agent-text-delta'; agentId: string; id: string; textDelta: string }
  | { kind: 'agent-text-done'; agentId: string; id: string }
  | {
      kind: 'agent-tool-call';
      agentId: string;
      callId: string;
      name: string;
      args: Record<string, unknown>;
      needsApproval: boolean;
      diff?: string;
    }
  | { kind: 'agent-tool-result'; agentId: string; callId: string; result: string; isError: boolean }
  | { kind: 'agent-tool-rejected'; agentId: string; callId: string; reason?: string }
  | { kind: 'agent-done'; agentId: string }
  | { kind: 'run-error'; message: string }
  | { kind: 'run-cancelled' }
  | { kind: 'run-done' };

export type ChatStreamEvent =
  | { kind: 'user-message'; id: string; text: string }
  | { kind: 'assistant-delta'; id: string; textDelta: string }
  | { kind: 'assistant-done'; id: string }
  | { kind: 'tool-call'; callId: string; name: string; args: Record<string, unknown>; needsApproval: boolean; diff?: string }
  | { kind: 'tool-result'; callId: string; result: string; isError: boolean }
  | { kind: 'tool-rejected'; callId: string; reason?: string }
  | { kind: 'run-error'; message: string }
  | { kind: 'run-cancelled' }
  | { kind: 'run-done' };

export interface ConversationSummary {
  id: string;
  title: string;
  providerId: string;
  model: string;
  updatedAt: number;
}

export interface TeamRunSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  provider: string;
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'listProviders' }
  | { type: 'addProvider'; provider: NewProviderInput; apiKey: string }
  | { type: 'updateProvider'; provider: ProviderConfig; apiKey?: string }
  | { type: 'removeProvider'; id: string }
  | { type: 'testProvider'; id: string }
  | { type: 'sendMessage'; providerId: string; model: string; text: string; mode: PermissionMode }
  | { type: 'approveTool'; callId: string; approved: boolean }
  | { type: 'listModels'; requestId: string; source: ModelsSource }
  | { type: 'listAgents' }
  | { type: 'addAgent'; agent: NewAgentInput }
  | { type: 'updateAgent'; agent: AgentDefinition }
  | { type: 'removeAgent'; id: string }
  | { type: 'reorderAgents'; orderedIds: string[] }
  | { type: 'runTeam'; task: string; mode: PermissionMode }
  | { type: 'sendToAgent'; agentId: string; text: string; mode: PermissionMode }
  | { type: 'resetAgentMemory'; agentId: string }
  | { type: 'listConversations' }
  | { type: 'openConversation'; id: string }
  | { type: 'newConversation' }
  | { type: 'renameConversation'; id: string; title: string }
  | { type: 'deleteConversation'; id: string }
  | { type: 'listTeamRuns' }
  | { type: 'openTeamRun'; id: string }
  | { type: 'renameTeamRun'; id: string; title: string }
  | { type: 'deleteTeamRun'; id: string }
  | { type: 'pickFile'; requestId: string }
  | { type: 'authGetState' }
  | { type: 'authSignInWithPassword'; email: string; password: string }
  | { type: 'authSignUp'; email: string; password: string }
  | { type: 'authSignInWithOAuth'; provider: 'github' | 'google' }
  | { type: 'authSignOut' }
  | { type: 'confirmAutoMode'; requestId: string }
  | { type: 'cancelRun' };

export type ExtensionToWebviewMessage =
  | { type: 'providers'; providers: ProviderConfig[] }
  | { type: 'providerTestResult'; id: string; ok: boolean; message: string }
  | { type: 'chatEvent'; event: ChatStreamEvent }
  | { type: 'error'; message: string }
  | { type: 'modelsResult'; requestId: string; ok: boolean; models: ModelInfo[]; message?: string }
  | { type: 'agents'; agents: AgentDefinition[] }
  | { type: 'teamEvent'; event: TeamStreamEvent }
  | { type: 'conversations'; conversations: ConversationSummary[]; activeId: string | null }
  | { type: 'conversationLoaded'; id: string | null; events: ChatStreamEvent[] }
  | { type: 'teamRuns'; runs: TeamRunSummary[] }
  | { type: 'teamRunLoaded'; id: string; events: TeamStreamEvent[] }
  | { type: 'pickFileResult'; requestId: string; path: string | null }
  | { type: 'authState'; user: AuthUser | null }
  | { type: 'authError'; message: string }
  | { type: 'authInfo'; message: string }
  | { type: 'confirmAutoModeResult'; requestId: string; confirmed: boolean };
