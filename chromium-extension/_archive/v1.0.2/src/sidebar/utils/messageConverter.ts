import { OpenBrowserMessage } from "@openbrowser-ai/core/types";
import type { ChatMessage } from "../types";

/**
 * Convert OpenBrowserMessage[] to ChatMessage[] for UI display
 * Groups consecutive assistant/tool messages into one ChatMessage
 */
export function convertOpenBrowserMessagesToChatMessages(
  messages: OpenBrowserMessage[]
): ChatMessage[] {
  const chatMessages: ChatMessage[] = [];
  let currentAssistant: ChatMessage | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      // User message - always create new ChatMessage
      currentAssistant = null; // Reset assistant grouping

      const chatMessage: ChatMessage = {
        id: message.id,
        role: "user",
        content: "",
        timestamp: message.timestamp,
        contentItems: [],
        status: "done"
      };

      // Extract text and files
      for (const part of message.content) {
        if ((part as any).type === "text") {
          chatMessage.content = (part as any).text;
        } else if ((part as any).type === "file") {
          if (!chatMessage.uploadedFiles) {
            chatMessage.uploadedFiles = [];
          }
          chatMessage.uploadedFiles.push({
            id: `${message.id}-file-${chatMessage.uploadedFiles.length}`,
            filename: (part as any).filename || "file",
            mimeType: (part as any).mimeType,
            base64Data: (part as any).data
          });
        }
      }

      chatMessages.push(chatMessage);
    } else if (message.role === "assistant") {
      // Assistant message - create new or append to existing
      if (!currentAssistant) {
        // Create new assistant message
        currentAssistant = {
          id: `ai-${message.id}`,
          role: "assistant",
          content: "",
          timestamp: message.timestamp,
          contentItems: [],
          status: "done"
        };
        chatMessages.push(currentAssistant);
      }

      // Process assistant message parts
      for (const part of message.content) {
        if ((part as any).type === "text") {
          currentAssistant.content = (part as any).text;
          currentAssistant.contentItems.push({
            type: "text",
            streamId: `${message.id}-text`,
            text: (part as any).text,
            streamDone: true
          });
        } else if ((part as any).type === "tool-call") {
          currentAssistant.contentItems.push({
            type: "tool",
            toolCallId: (part as any).toolCallId,
            toolName: (part as any).toolName,
            params: (part as any).args,
            running: false
          });
        } else if ((part as any).type === "file") {
          currentAssistant.contentItems.push({
            type: "file",
            mimeType: (part as any).mimeType,
            data: (part as any).data
          });
        }
      }
    } else if (message.role === "tool") {
      // Tool message - append to current assistant message
      if (!currentAssistant) {
        console.warn("Tool message without preceding assistant message");
        continue;
      }

      // Process tool results
      for (const part of message.content) {
        if ((part as any).type === "tool-result") {
          const toolCallId = (part as any).toolCallId;

          // Find the tool item in current assistant message
          const toolItem = currentAssistant.contentItems.find(
            (item) => item.type === "tool" && item.toolCallId === toolCallId
          );

          if (toolItem && toolItem.type === "tool") {
            // Convert stored result to ToolResult format
            const rawResult = (part as any).result;
            toolItem.result = {
              content: [
                {
                  type: "text" as const,
                  text:
                    typeof rawResult === "string"
                      ? rawResult
                      : JSON.stringify(rawResult, null, 2)
                }
              ],
              isError: false
            };
            toolItem.running = false;
          }
        }
      }
    }
  }

  return chatMessages;
}
