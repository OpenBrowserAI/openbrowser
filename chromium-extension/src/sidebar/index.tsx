import "./index.css";
import { uuidv4 } from "@openbrowser-ai/core";
import { createRoot } from "react-dom/client";
import { ChatInput } from "./components/ChatInput";
import { SessionHistory } from "./components/SessionHistory";
import { CapabilitiesTab } from "./components/CapabilitiesTab";
import { WorkflowsTab } from "./components/WorkflowsTab";
import { useFileUpload } from "./hooks/useFileUpload";
import { MessageItem } from "./components/MessageItem";
import type { ChatMessage, UploadedFile } from "./types";
import { useChatCallbacks } from "./hooks/useChatCallbacks";
import { useSessionManagement } from "./hooks/useSessionManagement";
import { ThemeProvider } from "./providers/ThemeProvider";
import { message as AntdMessage } from "antd";
import { History, Settings } from "lucide-react";
import React, { useState, useRef, useEffect, useCallback } from "react";

type Tab = "chat" | "capabilities" | "workflows";

const AppRun = () => {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const lastMessageCountRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  const {
    chatId,
    showSessionHistory,
    setShowSessionHistory,
    handleNewSession: newSession,
    handleShowSessionHistory,
    handleSelectSession: selectSession
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
    const scrollBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return scrollBottom < threshold;
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setAutoScroll(isNearBottom());
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [isNearBottom]);

  useEffect(() => {
    if (!autoScroll) return;
    const messageCount = messages.length;
    const isNewMessage = messageCount !== lastMessageCountRef.current;
    lastMessageCountRef.current = messageCount;

    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }

    scrollRafRef.current = requestAnimationFrame(() => {
      if (!autoScroll) return;
      if (isNewMessage) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });

    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
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
        showMessage({
          content: msg,
          className: "toast-text-black"
        });
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
          data: url.startsWith("http") ? url : file.base64Data
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
      status: "waiting"
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
          windowId: (await chrome.windows.getCurrent()).id
        }
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
      data: { messageId }
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
          filename: file.name
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

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSession(sessionId, setMessages, setCurrentMessageId);
    },
    [selectSession]
  );

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
    <div className="os-shell">
      {/* Titlebar — brand, segmented tabs, action icons */}
      <div className="os-titlebar">
        <div className="os-brand">
          <span className="os-brand-dot" aria-hidden />
          <span>OpenSurfer</span>
        </div>
        <div className="os-tabs" role="tablist">
          {(["chat", "capabilities", "workflows"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              data-active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className="os-tab"
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        {activeTab === "chat" && (
          <div className="os-titlebar-actions">
            <button
              type="button"
              className="os-icon-btn"
              aria-label="Session history"
              onClick={handleShowSessionHistory}
            >
              <History size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="os-icon-btn"
              aria-label="Settings"
              onClick={() => chrome.runtime.openOptionsPage()}
            >
              <Settings size={16} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {activeTab === "capabilities" && (
        <div className="os-body">
          <CapabilitiesTab />
        </div>
      )}

      {activeTab === "workflows" && (
        <div className="os-body">
          <WorkflowsTab />
        </div>
      )}

      {activeTab === "chat" && (
        <div ref={messagesContainerRef} className="os-body">
          {messages.length === 0 ? (
            <div className="os-empty">
              <div
                style={{
                  width: 120,
                  height: 120,
                  maskImage: "url(/icon_light.png)",
                  WebkitMaskImage: "url(/icon_light.png)",
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                  backgroundColor: "var(--gl-text-mute)",
                  opacity: 0.28
                }}
              />
            </div>
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
      )}

      {activeTab === "chat" && (
        <div className="os-composer">
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
          />
        </div>
      )}

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
    <ThemeProvider>
      <AppRun />
    </ThemeProvider>
  </React.StrictMode>
);
