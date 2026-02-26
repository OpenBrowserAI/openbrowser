import { useState, useCallback } from "react";
import { uuidv4 } from "@openbrowser-ai/core";
import { message as AntdMessage } from "antd";
import { dbService } from "../../db/db-service";
import { convertOpenBrowserMessagesToChatMessages } from "../utils/messageConverter";
import type { ChatMessage } from "../types";

export function useSessionManagement() {
  const [chatId, setChatId] = useState<string>(uuidv4());
  const [showSessionHistory, setShowSessionHistory] = useState(false);

  const handleNewSession = useCallback(
    (
      setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
      setCurrentMessageId: React.Dispatch<React.SetStateAction<string | null>>,
      messagesLength: number
    ) => {
      if (messagesLength > 0) {
        setMessages([]);
        setCurrentMessageId(null);
        setChatId(uuidv4());
      }
    },
    []
  );

  const handleShowSessionHistory = useCallback(() => {
    setShowSessionHistory(true);
  }, []);

  const handleSelectSession = useCallback(
    async (
      sessionId: string,
      setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
      setCurrentMessageId: React.Dispatch<React.SetStateAction<string | null>>
    ) => {
      try {
        const openBrowserMessages = await dbService.loadMessages(sessionId);
        const chatMessages =
          convertOpenBrowserMessagesToChatMessages(openBrowserMessages);

        setChatId(sessionId);
        setMessages(chatMessages);
        setCurrentMessageId(null);
        setShowSessionHistory(false);
      } catch (error) {
        console.error("Failed to load session:", error);
        AntdMessage.error("Failed to load session");
      }
    },
    []
  );

  return {
    chatId,
    showSessionHistory,
    setShowSessionHistory,
    handleNewSession,
    handleShowSessionHistory,
    handleSelectSession
  };
}
