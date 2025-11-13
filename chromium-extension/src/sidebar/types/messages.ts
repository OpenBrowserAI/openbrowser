// Message types
export interface WorkflowData {
  name?: string;
  thought?: string;
  agents?: Array<{
    name: string;
    task: string;
    nodes: string[];
  }>;
}

export interface ToolItem {
  type: "tool";
  agentName: string;
  toolName: string;
  toolId?: string; // Will be set when tool_use is received
  params?: any;
}

export interface ToolResultItem {
  type: "tool-result";
  toolId: string;
  toolName: string;
  params?: any;
  result: any;
}

export interface TextItem {
  type: "text";
  text: string;
}

export type MessageItem = ToolItem | ToolResultItem | TextItem;

export interface AssistantMessage {
  id: string;
  type: "assistant";
  workflow?: WorkflowData;
  items: MessageItem[]; // maintains natural order
  result?: { text: string; success: boolean };
  error?: string;
  timestamp: number; // For chronological sorting
  sessionId: string; // Session identifier
}

export interface UserMessage {
  id: string;
  type: "user";
  text: string;
  timestamp: number; // For chronological sorting
  sessionId: string; // Session identifier
}

export type Message = UserMessage | AssistantMessage;

export interface Session {
  id: string;
  title: string;
  updatedAt: number; // Acts as both created and updated timestamp
}
