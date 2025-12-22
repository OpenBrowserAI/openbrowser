import { useState, useEffect } from "react";
import {
  Message,
  UserMessage,
  AssistantMessage,
  TextItem,
  ToolItem,
} from "../types/messages";
import { parseWorkflowXML } from "../utils/xmlParser";
import { messageStorage } from "../services/messageStorage";
import { sessionStorage } from "../../sessions/services/sessionStorage";

export const useMessageHandler = (currentSessionId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAssistantMessage, setCurrentAssistantMessage] =
    useState<AssistantMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Load initial messages when session changes (most recent 50)
  useEffect(() => {
    const loadStoredMessages = async () => {
      if (!currentSessionId) {
        setIsLoading(false);
        return;
      }

      try {
        const result = await messageStorage.loadMessagesBySessionPaginated(
          currentSessionId,
          10 // Load most recent 10 messages
        );
        setMessages(result.messages);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error("Failed to load messages from storage:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredMessages();
  }, [currentSessionId]);

  // Load more older messages
  const loadMoreMessages = async () => {
    if (!currentSessionId || isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      // Get the timestamp of the oldest loaded message
      const oldestTimestamp = messages.length > 0 ? messages[0].timestamp : undefined;

      const result = await messageStorage.loadMessagesBySessionPaginated(
        currentSessionId,
        10, // Load 10 more messages
        oldestTimestamp
      );

      // Prepend older messages to the beginning
      setMessages((prev) => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error("Failed to load more messages:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    const messageListener = (message: {
      type?: string;
      messageType?: string;
      sessionId?: string;
      toolId?: string;
      toolName?: string;
      params?: Record<string, string | number | boolean | object>;
      toolResult?: string | number | boolean | object;
      workflow?: string;
      text?: string;
      streamDone?: boolean;
      agentName?: string;
      success?: boolean;
    }) => {
      if (!message) return;

      if (message.type === "stop") {
        // Finalize current assistant message if exists
        setCurrentAssistantMessage((prev) => {
          if (prev) {
            // Only add to messages array if it belongs to the current session
            if (prev.sessionId === currentSessionId) {
              setMessages((msgs) => [...msgs, prev]);
            }

            // Always save to IndexedDB with the correct sessionId
            messageStorage.addMessage(prev).catch((error) =>
              console.error("Failed to save assistant message:", error)
            );
          }
          return null;
        });
      } else if (message.type === "tool_result") {
        const toolResultItem = {
          type: "tool-result" as const,
          toolId: message.toolId,
          toolName: message.toolName,
          params: message.params,
          result: message.toolResult,
        };
        setCurrentAssistantMessage((prev) => {
          if (prev) {
            return { ...prev, items: [...prev.items, toolResultItem] };
          }
          return {
            id: `assistant-${Date.now()}`,
            type: "assistant",
            items: [toolResultItem],
            timestamp: Date.now(),
            sessionId: message.sessionId || currentSessionId,
          };
        });
      } else if (message.type === "message") {
        if (message.messageType === "workflow") {
          const parsed = parseWorkflowXML(message.workflow);
          setCurrentAssistantMessage((prev) => {
            if (prev) {
              return { ...prev, workflow: parsed };
            }
            return {
              id: `assistant-${Date.now()}`,
              type: "assistant",
              workflow: parsed,
              items: [],
              timestamp: Date.now(),
              sessionId: message.sessionId || currentSessionId,
            };
          });
        } else if (message.messageType === "text") {
          if (message.streamDone !== false) {
            const textItem: TextItem = {
              type: "text",
              text: message.text,
            };
            setCurrentAssistantMessage((prev) => {
              if (prev) {
                return { ...prev, items: [...prev.items, textItem] };
              }
              return {
                id: `assistant-${Date.now()}`,
                type: "assistant",
                items: [textItem],
                timestamp: Date.now(),
                sessionId: message.sessionId || currentSessionId,
              };
            });
          }
        } else if (message.messageType === "tool_use") {
          const toolItem: ToolItem = {
            type: "tool",
            agentName: message.agentName,
            toolName: message.toolName,
            toolId: message.toolId, // Store toolId from backend
            params: message.params,
          };
          setCurrentAssistantMessage((prev) => {
            if (prev) {
              return { ...prev, items: [...prev.items, toolItem] };
            }
            return {
              id: `assistant-${Date.now()}`,
              type: "assistant",
              items: [toolItem],
              timestamp: Date.now(),
              sessionId: message.sessionId || currentSessionId,
            };
          });
        } else if (message.messageType === "result") {
          setCurrentAssistantMessage((prev) => {
            if (prev) {
              return {
                ...prev,
                result: { text: message.text, success: message.success },
              };
            }
            return {
              id: `assistant-${Date.now()}`,
              type: "assistant",
              items: [],
              result: { text: message.text, success: message.success },
              timestamp: Date.now(),
              sessionId: message.sessionId || currentSessionId,
            };
          });
        } else if (message.messageType === "error") {
          setCurrentAssistantMessage((prev) => {
            if (prev) {
              return { ...prev, error: message.text };
            }
            return {
              id: `assistant-${Date.now()}`,
              type: "assistant",
              items: [],
              error: message.text,
              timestamp: Date.now(),
              sessionId: message.sessionId || currentSessionId,
            };
          });
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [currentSessionId]);

  const addUserMessage = async (text: string) => {
    const trimmedText = text.trim();
    const userMsg: UserMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      text: trimmedText,
      timestamp: Date.now(),
      sessionId: currentSessionId,
    };
    setMessages((prev) => [...prev, userMsg]);
    setCurrentAssistantMessage(null);

    // Create/update session with title from first user message (first 50 chars)
    const title = trimmedText.slice(0, 50) + (trimmedText.length > 50 ? "..." : "");
    sessionStorage.upsertSession(currentSessionId, title).catch((error) =>
      console.error("Failed to upsert session:", error)
    );

    // Save to IndexedDB directly as Message
    messageStorage.addMessage(userMsg).catch((error) =>
      console.error("Failed to save user message:", error)
    );
  };

  const clearAllMessages = async () => {
    try {
      await messageStorage.clearMessages();
      setMessages([]);
      setCurrentAssistantMessage(null);
    } catch (error) {
      console.error("Failed to clear messages:", error);
    }
  };

  const clearMessagesOnSessionChange = () => {
    // Clear UI messages when session changes
    setMessages([]);
    setCurrentAssistantMessage(null);
  };

  return {
    messages,
    currentAssistantMessage,
    addUserMessage,
    clearAllMessages,
    clearMessagesOnSessionChange,
    isLoading,
    hasMore,
    isLoadingMore,
    loadMoreMessages,
  };
};
