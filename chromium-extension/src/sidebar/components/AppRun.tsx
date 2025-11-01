import React from "react";
import { Button, Input } from "antd";
import { AssistantMessageBubble } from "./AssistantMessageBubble";
import { UserMessageBubble } from "./UserMessageBubble";
import { WorkingIndicator } from "./WorkingIndicator";
import { useMessageHandler } from "../hooks/useMessageHandler";
import { useStorageSync } from "../hooks/useStorageSync";
import { useModeConfig } from "../hooks/useModeConfig";
import { useAutoScroll } from "../hooks/useAutoScroll";
import "../styles/sidebar.css";

export const AppRun: React.FC = () => {
  const { messages, currentAssistantMessage, addUserMessage } = useMessageHandler();
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
    chrome.runtime.sendMessage({ type: "run", prompt: prompt.trim() });
  };

  return (
    <div className="app">
      <div className="chat-area">
        {messages.map((msg) =>
          msg.type === "user" ? (
            <UserMessageBubble key={msg.id} message={msg} />
          ) : (
            <AssistantMessageBubble key={msg.id} message={msg} />
          )
        )}
        {currentAssistantMessage && (
          <AssistantMessageBubble message={currentAssistantMessage} />
        )}
        {running && !currentAssistantMessage && <WorkingIndicator />}
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
    </div>
  );
};
