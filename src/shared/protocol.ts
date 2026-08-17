export type ProviderKind = 'openai-compatible' | 'anthropic' | 'huggingface-oauth' | 'vscode-copilot';

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
  | { kind: 'agent-usage'; agentId: string; inputTokens: number; outputTokens: number }
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

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  providerId: string;
  model: string;
  updatedAt: number;
  usage?: UsageTotals;
}

export interface TeamRunSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface AttachmentRef {
  path: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

export type NewMcpServerInput = Omit<McpServerConfig, 'id'>;

export interface PromptTemplate {
  id: string;
  trigger: string;
  label: string;
  expansion: string;
  attachActiveFile: boolean;
}

export type NewPromptTemplateInput = Omit<PromptTemplate, 'id'>;

export interface SkillSummary {
  name: string;
  description: string;
  scope: 'project' | 'personal';
  /** Ruta absoluta al SKILL.md, para abrirlo en el editor. */
  path: string;
}

export interface ActiveSelectionInfo {
  path: string;
  text: string;
  startLine: number;
  endLine: number;
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  provider: string;
  plan: 'free' | 'pro';
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'listProviders' }
  | { type: 'addProvider'; provider: NewProviderInput; apiKey: string }
  | { type: 'updateProvider'; provider: ProviderConfig; apiKey?: string }
  | { type: 'removeProvider'; id: string }
  | { type: 'testProvider'; id: string }
  | { type: 'sendMessage'; providerId: string; model: string; text: string; mode: PermissionMode; attachments?: AttachmentRef[] }
  | { type: 'approveTool'; callId: string; approved: boolean }
  | { type: 'answerQuestion'; callId: string; answer: string }
  | { type: 'listModels'; requestId: string; source: ModelsSource }
  | { type: 'listAgents' }
  | { type: 'addAgent'; agent: NewAgentInput }
  | { type: 'updateAgent'; agent: AgentDefinition }
  | { type: 'removeAgent'; id: string }
  | { type: 'reorderAgents'; orderedIds: string[] }
  | { type: 'runTeam'; task: string; mode: PermissionMode; attachments?: AttachmentRef[] }
  | { type: 'sendToAgent'; agentId: string; text: string; mode: PermissionMode; attachments?: AttachmentRef[] }
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
  | { type: 'authSignInWeb' }
  | { type: 'authSignOut' }
  | { type: 'confirmAutoMode'; requestId: string }
  | { type: 'cancelRun'; scope: 'chat' | 'team' }
  | { type: 'hfSignIn' }
  | { type: 'hfSignOut' }
  | { type: 'connectHuggingFace' }
  | { type: 'detectCopilot' }
  | { type: 'openExternalUrl'; url: string }
  | { type: 'revertToCheckpoint'; conversationId: string; messageId: string }
  | { type: 'setLiveEditorPreview'; enabled: boolean }
  | { type: 'searchWorkspaceFiles'; requestId: string; query: string }
  | { type: 'getActiveSelection'; requestId: string }
  | { type: 'listMcpServers' }
  | { type: 'addMcpServer'; server: NewMcpServerInput }
  | { type: 'updateMcpServer'; server: McpServerConfig }
  | { type: 'removeMcpServer'; id: string }
  | { type: 'detectMcpTools'; id: string }
  | { type: 'listUsage' }
  | { type: 'resetUsage'; providerId: string }
  | { type: 'listPromptTemplates' }
  | { type: 'addPromptTemplate'; template: NewPromptTemplateInput }
  | { type: 'removePromptTemplate'; id: string }
  | { type: 'listSkills' }
  | { type: 'createSkill'; name: string; scope: 'project' | 'personal' }
  | { type: 'openSkill'; path: string };

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
  | { type: 'confirmAutoModeResult'; requestId: string; confirmed: boolean }
  | { type: 'chatRunState'; running: boolean; assistantId?: string; partialText?: string }
  | { type: 'teamRunState'; running: boolean }
  | { type: 'hfAuthState'; user: AuthUser | null }
  | { type: 'copilotDetectResult'; ok: boolean; message: string }
  | { type: 'settingsState'; liveEditorPreview: boolean }
  | { type: 'searchWorkspaceFilesResult'; requestId: string; paths: string[] }
  | { type: 'activeSelectionResult'; requestId: string; selection: ActiveSelectionInfo | null }
  | { type: 'mcpServers'; servers: McpServerConfig[] }
  | { type: 'mcpDetectResult'; id: string; ok: boolean; message: string; toolNames: string[] }
  | { type: 'runFromEditor'; text: string }
  | { type: 'usageState'; totals: Record<string, UsageTotals & { providerName: string }> }
  | { type: 'promptTemplates'; templates: PromptTemplate[] }
  | { type: 'skills'; skills: SkillSummary[] };
