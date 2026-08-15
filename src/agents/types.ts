export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  items?: { type: string };
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  requiresApproval: boolean;
}
