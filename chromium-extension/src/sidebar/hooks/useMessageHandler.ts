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

export const useMessageHandler = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAssistantMessage, setCurrentAssistantMessage] =
    useState<AssistantMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load messages from IndexedDB on mount
  useEffect(() => {
    const loadStoredMessages = async () => {
      try {
        const storedMessages = await messageStorage.loadMessages();
        setMessages(storedMessages);
      } catch (error) {
        console.error("Failed to load messages from storage:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredMessages();
  }, []);

  useEffect(() => {
    const messageListener = (message: any) => {
      if (!message) return;

      if (message.type === "stop") {
        // Finalize current assistant message if exists
        setCurrentAssistantMessage((prev) => {
          if (prev) {
            setMessages((msgs) => {
              const newMessages = [...msgs, prev];
              // Persist to IndexedDB
              messageStorage.addMessage(prev).catch((error) =>
                console.error("Failed to save assistant message:", error)
              );
              return newMessages;
            });
          }
          return null;
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
              };
            });
          }
        } else if (message.messageType === "tool_use") {
          const toolItem: ToolItem = {
            type: "tool",
            agentName: message.agentName,
            toolName: message.toolName,
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
            };
          });
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const addUserMessage = (text: string) => {
    const userMsg: UserMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      text: text.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setCurrentAssistantMessage(null);

    // Persist user message to IndexedDB
    messageStorage.addMessage(userMsg).catch((error) =>
      console.error("Failed to save user message:", error)
    );
  };

  return {
    messages,
    currentAssistantMessage,
    addUserMessage,
    isLoading,
  };
};
