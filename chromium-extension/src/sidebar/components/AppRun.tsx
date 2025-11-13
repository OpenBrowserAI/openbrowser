import React from "react";
import { Button, Input } from "antd";
import { AssistantMessageBubble } from "./AssistantMessageBubble";
import { UserMessageBubble } from "./UserMessageBubble";
import { WorkingIndicator } from "./WorkingIndicator";
import { SessionsList } from "./SessionsList";
import { useMessageHandler } from "../hooks/useMessageHandler";
import { useStorageSync } from "../hooks/useStorageSync";
import { useModeConfig } from "../hooks/useModeConfig";
import { useAutoScroll } from "../hooks/useAutoScroll";
import { useCurrentSession } from "../hooks/useCurrentSession";
import { buildLLMContext } from "../utils/contextBuilder";
import "../styles/sidebar.css";

export const AppRun: React.FC = () => {
  const { currentSessionId, sessions, showSessions, handleNewSession, handleToggleSessions, handleSelectSession, handleDeleteSession } = useCurrentSession();
  const { messages, currentAssistantMessage, addUserMessage, clearMessagesOnSessionChange, isLoading } = useMessageHandler(currentSessionId);
  const { running, prompt, updateRunningState, updatePrompt } = useStorageSync();
  const { mode, markImageMode, setMode, setMarkImageMode } = useModeConfig();
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
                {messages.map((msg) => {
                  if (msg.type === "user") {
                    return <UserMessageBubble key={msg.id} message={msg} />;
                  }
                  if (msg.type === "assistant") {
                    return <AssistantMessageBubble key={msg.id} message={msg} />;
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
            <select
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as "fast" | "normal" | "expert")
              }
              className="control-select"
            >
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="expert">Expert</option>
            </select>
            <select
              value={markImageMode}
              onChange={(e) => setMarkImageMode(e.target.value as "dom" | "draw")}
              className="control-select"
            >
              <option value="dom">DOM</option>
              <option value="draw">Draw</option>
            </select>
            <button
              onClick={handleToggleSessions}
              className="control-select"
              title="Sessions"
            >
              📋
            </button>
            <button
              onClick={() => handleNewSession(clearMessagesOnSessionChange)}
              className="control-select"
              title="Start new session"
            >
              ➕
            </button>
          </div>

          <Button
            type="primary"
            onClick={handleClick}
            disabled={!prompt.trim() && !running}
            className={`action-btn ${running ? "stop" : ""}`}
          >
            {running ? "■" : "↑"}
          </Button>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
