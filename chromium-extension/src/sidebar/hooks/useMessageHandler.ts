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

export const useMessageHandler = (currentSessionId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAssistantMessage, setCurrentAssistantMessage] =
    useState<AssistantMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load messages when session changes
  useEffect(() => {
    const loadStoredMessages = async () => {
      if (!currentSessionId) {
        setIsLoading(false);
        return;
      }

      try {
        const storedMessages = await messageStorage.loadMessagesBySession(currentSessionId);
        setMessages(storedMessages);
      } catch (error) {
        console.error("Failed to load messages from storage:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredMessages();
  }, [currentSessionId]);

  useEffect(() => {
    const messageListener = (message: any) => {
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
    const userMsg: UserMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      text: text.trim(),
      timestamp: Date.now(),
      sessionId: currentSessionId,
    };
    setMessages((prev) => [...prev, userMsg]);
    setCurrentAssistantMessage(null);

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
  };
};
