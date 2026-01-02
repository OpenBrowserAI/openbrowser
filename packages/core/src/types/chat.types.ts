import {
  JSONSchema7,
  SharedV2ProviderOptions,
  LanguageModelV2ToolCallPart,
} from "@ai-sdk/provider";
import { ToolResult } from "./tools.types";
import { LLMStreamMessage } from "./llm.types";
import { OpenBrowserConfig, HumanCallback, AgentStreamCallback } from "./agent.types";

export type MessageTextPart = {
  type: "text";
  text: string;
};

export type MessageFilePart = {
  type: "file";
  fileId: string;
  filename?: string;
  mimeType: string;
  data: string; // base64 / URL
  filePath?: string;
};

export type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;
};

export type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  isError: boolean;
  output: string | Record<string, any>;
};

export type ChatStreamMessage = {
  streamType: "chat";
  chatId: string;
  messageId: string;
} & (
  | {
      type: "chat_start";
    }
  | LLMStreamMessage
  | {
      type: "chat_end";
      error: string | null;
      duration: number;
      reactLoopNum: number;
    }
);

export interface ChatStreamCallback {
  chatCallback: {
    onMessage: (message: ChatStreamMessage) => Promise<void>;
  };
  taskCallback?: AgentStreamCallback & HumanCallback;
}

export type OpenBrowserMessage = { id: string } & (
  | {
      role: "user";
      content: OpenBrowserMessageUserPart[];
    }
  | {
      role: "assistant";
      content: OpenBrowserMessageAssistantPart[];
    }
  | {
      role: "tool";
      content: OpenBrowserMessageToolPart[];
    }
) & {
    timestamp: number;
    extra?: Record<string, any>;
  };

export type OpenBrowserMessageUserPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      mimeType: string;
      data: string; // base64 / URL
      filename?: string;
    };

export type OpenBrowserMessageAssistantPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      providerOptions?: SharedV2ProviderOptions;
    };

export type OpenBrowserMessageToolPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: string | Record<string, unknown>;
};

export interface DialogueTool {
  readonly name: string;
  readonly description?: string;
  readonly parameters: JSONSchema7;
  execute: (
    args: Record<string, unknown>,
    toolCall: LanguageModelV2ToolCallPart,
    messageId: string
  ) => Promise<ToolResult>;
}

export type OpenBrowserDialogueConfig = Omit<OpenBrowserConfig, "callback"> & {
  chatLlms?: string[];
};

export type DialogueParams = {
  messageId: string;
  user: Array<MessageTextPart | MessageFilePart>;
  callback: ChatStreamCallback;
  datetime?: string;
  signal?: AbortSignal;
  extra?: Record<string, any>;
};
