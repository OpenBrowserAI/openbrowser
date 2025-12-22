import { Message } from "../../messages/types/messages";

interface LLMTextContent {
  type: "text";
  text: string;
}

interface LLMToolCallContent {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: Record<string, string | number | boolean | object>;
}

interface LLMToolResultContent {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: { type: "text"; value: string } | { type: "json"; value: string | number | boolean | object };
}

type LLMContent = LLMTextContent | LLMToolCallContent | LLMToolResultContent;

interface LLMMessage {
  role: "user" | "assistant" | "tool";
  content: LLMContent[];
}

/**
 * Convert Message[] to LanguageModelV2Prompt format
 * This format is used by core's Agent.runWithContext() historyMessages parameter
 *
 * @param messages - Messages for the current session (already filtered)
 */
export function buildLLMContext(messages: Message[]): LLMMessage[] {
  const result: LLMMessage[] = [];

  for (const msg of messages) {
    if (msg.type === "user") {
      // User message
      result.push({
        role: "user",
        content: [
          {
            type: "text",
            text: msg.text || "",
          },
        ],
      });
    } else if (msg.type === "assistant") {
      // Assistant message - includes text, tool calls, and tool results
      const assistantContent: LLMContent[] = [];
      const toolResultContent: LLMToolResultContent[] = [];

      if (msg.items && Array.isArray(msg.items)) {
        msg.items.forEach((item) => {
          if (item.type === "text" && item.text) {
            // Only add text BEFORE any tool calls
            if (assistantContent.every((c) => c.type !== "tool-call")) {
              assistantContent.push({
                type: "text",
                text: item.text,
              });
            }
          } else if (item.type === "tool" && item.toolName && item.toolId) {
            // Tool call
            assistantContent.push({
              type: "tool-call",
              toolCallId: item.toolId,
              toolName: item.toolName,
              input: item.params || {},
            });
          } else if (item.type === "tool-result" && item.toolId) {
            // Tool result - collect for separate tool message
            toolResultContent.push({
              type: "tool-result",
              toolCallId: item.toolId,
              toolName: item.toolName,
              output:
                typeof item.result === "string"
                  ? { type: "text", value: item.result }
                  : { type: "json", value: item.result },
            });
          }
        });
      }

      // Add assistant message if it has content
      if (assistantContent.length > 0) {
        result.push({
          role: "assistant",
          content: assistantContent,
        });
      }

      // Add tool results as separate tool message (required by Anthropic API)
      if (toolResultContent.length > 0) {
        result.push({
          role: "tool",
          content: toolResultContent,
        });
      }

      // Note: msg.result?.text is the final response after tool execution
      // It should be handled as a separate assistant message after tool results
      // For now, we skip it to avoid format violations
    }
  }
  return result;
}
