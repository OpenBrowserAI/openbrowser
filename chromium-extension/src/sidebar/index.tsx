import "./index.css";
import { uuidv4 } from "@openbrowser-ai/core";
import { createRoot } from "react-dom/client";
import { ChatInput } from "./components/ChatInput";
import { SessionHistory } from "./components/SessionHistory";
import { useFileUpload } from "./hooks/useFileUpload";
import { MessageItem } from "./components/MessageItem";
import type { ChatMessage, UploadedFile } from "./types";
import { useChatCallbacks } from "./hooks/useChatCallbacks";
import { useSessionManagement } from "./hooks/useSessionManagement";
import { Empty, message as AntdMessage } from "antd";
import React, { useState, useRef, useEffect, useCallback } from "react";

const AppRun = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const {
    chatId,
    showSessionHistory,
    setShowSessionHistory,
    handleNewSession: newSession,
    handleShowSessionHistory,
    handleSelectSession: selectSession,
  } = useSessionManagement();

  const forceUpdate = useCallback(
    (status?: "stop") => {
      if (status === "stop") {
        setCurrentMessageId(null);
      }
      setUpdateTrigger((prev) => prev + 1);
    },
    [setCurrentMessageId]
  );

  const { handleChatCallback, handleTaskCallback } = useChatCallbacks(
    setMessages,
    currentMessageId,
    setCurrentMessageId
  );
  const { fileToBase64, uploadFile } = useFileUpload();

  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || container.scrollHeight <= container.clientHeight * 1.6) {
      return true;
    }
    const threshold = container.clientHeight / 3;
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return scrollBottom < threshold;
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setAutoScroll(isNearBottom());
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [isNearBottom]);

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  // Listen to background messages
  useEffect(() => {
    const handleMessage = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (message.type === "chat_callback") {
        handleChatCallback(message.data);
      } else if (message.type === "task_callback") {
        handleTaskCallback(message.data);
      } else if (message.type === "chat_result") {
        const messageId = message.data.messageId;
        const error = message.data.error;
        if (error && messageId === currentMessageId) {
          setCurrentMessageId(null);
          const userMessage = messages.find((m) => m.id === messageId);
          if (userMessage) {
            userMessage.status = "error";
          }
        }
      } else if (message.type === "log") {
        const level = message.data.level;
        const msg = message.data.message;
        const showMessage =
          level === "error"
            ? AntdMessage.error
            : level === "success"
            ? AntdMessage.success
            : AntdMessage.info;
        showMessage(msg, 3);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleChatCallback, handleTaskCallback, currentMessageId]);

  // Send message
  const sendMessage = useCallback(async () => {
    if ((!inputValue.trim() && uploadedFiles.length === 0) || sending) return;

    const messageId = uuidv4();

    // Upload files
    const fileParts: Array<{
      type: "file";
      fileId: string;
      filename?: string;
      mimeType: string;
      data: string;
    }> = [];
    for (const file of uploadedFiles) {
      try {
        const { fileId, url } = await uploadFile(file);
        file.fileId = fileId;
        file.url = url;
        fileParts.push({
          type: "file",
          fileId,
          filename: file.filename,
          mimeType: file.mimeType,
          data: url.startsWith("http") ? url : file.base64Data,
        });
      } catch (error) {
        console.error("Error uploading file:", error);
      }
    }

    // Build user message content
    const userParts: Array<
      | { type: "text"; text: string }
      | {
          type: "file";
          fileId: string;
          filename?: string;
          mimeType: string;
          data: string;
        }
    > = [];
    if (inputValue.trim()) {
      userParts.push({ type: "text", text: inputValue });
    }
    userParts.push(...fileParts);

    const userMessage: ChatMessage = {
      id: messageId,
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
      contentItems: [],
      uploadedFiles: [...uploadedFiles],
      status: "waiting",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setUploadedFiles([]);
    setSending(true);
    setCurrentMessageId(messageId);

    try {
      chrome.runtime.sendMessage({
        requestId: uuidv4(),
        type: "chat",
        data: {
          user: userParts,
          messageId: messageId,
          chatId: chatId,
          windowId: (await chrome.windows.getCurrent()).id,
        },
      });
    } catch (error) {
      userMessage.status = "error";
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  }, [inputValue, uploadedFiles, sending, uploadFile, chatId]);

  // Stop message
  const stopMessage = useCallback((messageId: string) => {
    chrome.runtime.sendMessage({
      type: "stop",
      data: { messageId },
    });
    setCurrentMessageId(null);
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const newFiles: UploadedFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64Data = await fileToBase64(file);
        newFiles.push({
          id: uuidv4(),
          base64Data: base64Data,
          mimeType: file.type,
          filename: file.name,
        });
      }
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    },
    [fileToBase64]
  );

  // Remove file
  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleStop = useCallback(() => {
    if (currentMessageId) {
      stopMessage(currentMessageId);
    }
  }, [currentMessageId, stopMessage]);

  const handleNewSession = useCallback(() => {
    newSession(setMessages, setCurrentMessageId, messages.length);
  }, [newSession, messages.length]);

  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId, setMessages, setCurrentMessageId);
  }, [selectSession]);

  // Listen for storage changes (e.g., when LLM config is updated)
  useEffect(() => {
    const handleStorageChange = async (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === "sync" && changes["llmConfig"]) {
        handleNewSession();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [handleNewSession]);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Message area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-gray-100 relative"
      >
        {messages.length === 0 ? (
          <Empty
            description="Start a conversation!"
            className="mt-[20vh]"
          />
        ) : (
          messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onUpdateMessage={forceUpdate}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSend={sendMessage}
        onStop={handleStop}
        onFileSelect={handleFileSelect}
        onRemoveFile={removeFile}
        uploadedFiles={uploadedFiles}
        sending={sending}
        currentMessageId={currentMessageId}
        onNewSession={handleNewSession}
        onShowSessionHistory={handleShowSessionHistory}
      />

      {/* Session History Modal */}
      <SessionHistory
        visible={showSessionHistory}
        onClose={() => setShowSessionHistory(false)}
        onSelectSession={handleSelectSession}
        currentSessionId={chatId}
      />
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <AppRun />
  </React.StrictMode>
);
