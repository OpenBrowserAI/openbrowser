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
  params?: any;
}

export interface TextItem {
  type: "text";
  text: string;
}

export type MessageItem = ToolItem | TextItem;

export interface AssistantMessage {
  id: string;
  type: "assistant";
  workflow?: WorkflowData;
  items: MessageItem[]; // maintains natural order
  result?: { text: string; success: boolean };
  error?: string;
}

export interface UserMessage {
  id: string;
  type: "user";
  text: string;
}

export type Message = UserMessage | AssistantMessage;
