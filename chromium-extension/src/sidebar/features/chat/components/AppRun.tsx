import React from "react";
import { Button, Input } from "antd";
import { History, Square, Send, Plus, Settings, ChevronUp } from "lucide-react";
import { AssistantMessageBubble } from "../../messages/components/AssistantMessageBubble";
import { UserMessageBubble } from "../../messages/components/UserMessageBubble";
import { WorkingIndicator } from "../../messages/components/WorkingIndicator";
import { SessionsList } from "../../sessions/components/SessionsList";
import { useMessageHandler } from "../../messages/hooks/useMessageHandler";
import { useStorageSync } from "../../../storage/hooks/useStorageSync";
import { useModeConfig } from "../hooks/useModeConfig";
import { useAutoScroll } from "../../messages/hooks/useAutoScroll";
import { useCurrentSession } from "../../sessions/hooks/useCurrentSession";
import { buildLLMContext } from "../utils/contextBuilder";
import "../../../styles/sidebar.css";

export const AppRun: React.FC = () => {
  const {
    currentSessionId,
    sessions,
    showSessions,
    handleNewSession,
    handleToggleSessions,
    handleSelectSession,
    handleDeleteSession,
  } = useCurrentSession();
  const {
    messages,
    currentAssistantMessage,
    addUserMessage,
    clearMessagesOnSessionChange,
    isLoading,
    hasMore,
    isLoadingMore,
    loadMoreMessages,
  } = useMessageHandler(currentSessionId);
  const { running, prompt, updateRunningState, updatePrompt } =
    useStorageSync();
  const { mode, markImageMode } = useModeConfig();
  const messagesEndRef = useAutoScroll([messages, currentAssistantMessage]);

  const handleClick = () => {
    if (running) {
      updateRunningState(false, prompt);
      chrome.runtime.sendMessage({ type: "stop" });
      return;
    }
    if (!prompt.trim()) {
      return;
    }

    addUserMessage(prompt);
    updateRunningState(true, prompt);

    // Build context (messages are already filtered by session)
    const llmContext = buildLLMContext(messages);
    chrome.runtime.sendMessage({
      type: "run",
      prompt: prompt.trim(),
      context: llmContext, // Send conversation history
      sessionId: currentSessionId, // Include sessionId to ensure messages stay in same session
    });
  };

  return (
    <div className="app">
      {showSessions ? (
        <SessionsList
          sessions={sessions}
          onSelectSession={handleSelectSession}
          onDeleteSession={(sessionId, e) => {
            e.stopPropagation();
            handleDeleteSession(sessionId, clearMessagesOnSessionChange);
          }}
          onNewSession={() => handleNewSession(clearMessagesOnSessionChange)}
        />
      ) : (
        <>
          <div className="chat-area">
            {isLoading ? (
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            ) : (
              <>
                {hasMore && (
                  <div className="load-more-container">
                    <Button
                      onClick={loadMoreMessages}
                      loading={isLoadingMore}
                      className="load-more-btn"
                      icon={!isLoadingMore && <ChevronUp size={14} />}
                    >
                      {isLoadingMore ? "Loading..." : "Load older messages"}
                    </Button>
                    <div className="load-more-divider">
                      <span>Older messages</span>
                    </div>
                  </div>
                )}
                {messages.map((msg) => {
                  if (msg.type === "user") {
                    return <UserMessageBubble key={msg.id} message={msg} />;
                  }
                  if (msg.type === "assistant") {
                    return (
                      <AssistantMessageBubble key={msg.id} message={msg} />
                    );
                  }
                  // Skip tool-result messages (shouldn't be in display list but TypeScript doesn't know)
                  return null;
                })}
                {currentAssistantMessage && (
                  <AssistantMessageBubble message={currentAssistantMessage} />
                )}
                {running && !currentAssistantMessage && <WorkingIndicator />}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-bar">
            <div className="input-row">
              <Input.TextArea
                rows={3}
                value={prompt}
                disabled={running}
                placeholder="What would you like me to do?"
                onChange={(e) => updatePrompt(e.target.value)}
                className="input-field"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleClick();
                  }
                }}
              />

              <div className="controls">
                <button
                  onClick={handleToggleSessions}
                  className="control-select"
                  title="History"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <History size={16} />
                </button>
                <button
                  onClick={() => chrome.runtime.openOptionsPage()}
                  className="control-select"
                  title="Settings"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Settings size={16} />
                </button>
              </div>

              <Button
                type="primary"
                onClick={
                  prompt.trim() || running
                    ? handleClick
                    : () => handleNewSession(clearMessagesOnSessionChange)
                }
                className={`action-btn ${running ? "stop" : ""}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {running ? (
                  <Square size={16} fill="currentColor" />
                ) : prompt.trim() ? (
                  <Send size={16} />
                ) : (
                  <Plus size={16} />
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
