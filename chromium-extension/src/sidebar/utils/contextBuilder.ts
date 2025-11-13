import { Message } from "../types/messages";

/**
 * Convert Message[] to LanguageModelV2Prompt format
 * This format is used by core's Agent.runWithContext() historyMessages parameter
 *
 * @param messages - Messages for the current session (already filtered)
 */
export function buildLLMContext(messages: Message[]) {
  const result: any[] = [];

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
      const assistantContent: any[] = [];
      const toolResultContent: any[] = [];

      if (msg.items && Array.isArray(msg.items)) {
        msg.items.forEach((item) => {
          if (item.type === "text" && item.text) {
            // Only add text BEFORE any tool calls
            if (assistantContent.every(c => c.type !== "tool-call")) {
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
 