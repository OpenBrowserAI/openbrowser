import {
  JSONSchema7,
  LanguageModelV2FinishReason,
  LanguageModelV2ToolCallPart
} from "@ai-sdk/provider";
import { ToolResult } from "./tools.types";
import { OpenBrowserConfig, HumanCallback, StreamCallback } from "./core.types";

export type OpenBrowserMessage =
  | {
      id: string;
      role: "user";
      timestamp: number;
      content: string | OpenBrowserMessageUserPart[];
    }
  | {
      id: string;
      role: "assistant";
      timestamp: number;
      content: OpenBrowserMessageAssistantPart[];
    }
  | {
      id: string;
      role: "tool";
      timestamp: number;
      content: OpenBrowserMessageToolPart[];
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
    };

export type OpenBrowserMessageAssistantPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "reasoning";
      text: string;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
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
    toolCall: LanguageModelV2ToolCallPart
  ) => Promise<ToolResult>;
}

export type OpenBrowserDialogueConfig = Omit<OpenBrowserConfig, "callback"> & {
  chatLlms?: string[];
  segmentedExecution?: boolean;
};

export type DialogueParams = {
  user: string | OpenBrowserMessageUserPart[];
  callback?: DialogueCallback;
  messageId?: string;
  signal?: AbortSignal;
};

export type DialogueCallback = {
  chatCallback?: {
    onMessage: (message: ChatStreamCallbackMessage) => Promise<void>;
  };
  taskCallback?: StreamCallback & HumanCallback;
};

export type ChatStreamCallbackMessage =
  | {
      type: "text" | "thinking";
      streamId: string;
      streamDone: boolean;
      text: string;
    }
  | {
      type: "tool_streaming";
      toolName: string;
      toolId: string;
      paramsText: string;
    }
  | {
      type: "tool_use";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
    }
  | {
      type: "tool_running";
      toolName: string;
      toolId: string;
      text: string;
      streamId: string;
      streamDone: boolean;
    }
  | {
      type: "tool_result";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
      toolResult: ToolResult;
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "finish";
      finishReason: LanguageModelV2FinishReason;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    };
