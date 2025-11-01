import { useState, useEffect } from "react";
import {
  Message,
  UserMessage,
  AssistantMessage,
  TextItem,
  ToolItem,
} from "../types/messages";
import { parseWorkflowXML } from "../utils/xmlParser";

export const useMessageHandler = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAssistantMessage, setCurrentAssistantMessage] =
    useState<AssistantMessage | null>(null);

  useEffect(() => {
    const messageListener = (message: any) => {
      if (!message) return;

      if (message.type === "stop") {
        // Finalize current assistant message if exists
        setCurrentAssistantMessage((prev) => {
          if (prev) {
            setMessages((msgs) => [...msgs, prev]);
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
  };

  return {
    messages,
    currentAssistantMessage,
    addUserMessage,
  };
};
