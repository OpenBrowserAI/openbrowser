import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AssistantMessage } from "../types/messages";
import { CollapsibleSection } from "./CollapsibleSection";
import { ToolDisplay } from "./ToolDisplay";
import { StepDisplay } from "./StepDisplay";
import { parseStepsFromText, cleanText, removeElementIndexes } from "../utils/textParser";

interface AssistantMessageBubbleProps {
  message: AssistantMessage;
}

export const AssistantMessageBubble: React.FC<AssistantMessageBubbleProps> = ({
  message,
}) => {
  return (
    <div className="message-group assistant">
      <div className="avatar assistant-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22.5l-.394-1.933a2.25 2.25 0 00-1.423-1.423L12.75 18.75l1.933-.394a2.25 2.25 0 001.423-1.423l.394-1.933.394 1.933a2.25 2.25 0 001.423 1.423l1.933.394-1.933.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      </div>
      <div className="message-content">
        {/* Thinking Section */}
        {message.workflow?.thought && (
          <CollapsibleSection title="Thought" defaultCollapsed={true}>
            <div className="thought-text">{message.workflow.thought}</div>
          </CollapsibleSection>
        )}

        {/* Plan Section - show agent breakdown */}
        {message.workflow?.agents && message.workflow.agents.length > 0 && (
          <div className="plan-section">
            {message.workflow.name && (
              <div className="plan-title">{message.workflow.name}</div>
            )}
            <div className="plan-content">
              {message.workflow.agents.map((agent, idx) => (
                <div key={idx} className="agent-plan">
                  <div className="agent-header">
                    <span className="agent-icon">🤖</span>
                    <strong>{agent.name} Agent</strong>
                  </div>
                  <div className="agent-task">{agent.task}</div>
                  {agent.nodes && agent.nodes.length > 0 && (
                    <div className="agent-steps">
                      {agent.nodes.map((node, nodeIdx) => (
                        <div key={nodeIdx} className="agent-step">
                          <span className="step-badge">STEP {nodeIdx + 1}</span>
                          <span className="step-text">{node}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items in natural order */}
        {message.items.map((item, idx) => {
          if (item.type === "tool") {
            return <ToolDisplay key={idx} tool={item} />;
          }
          if (item.type === "text") {
            // Parse text for steps
            const cleanedText = removeElementIndexes(cleanText(item.text));
            const parsed = parseStepsFromText(cleanedText);

            // If steps were found, display them in structured format
            if (parsed.steps.length > 0) {
              return (
                <div key={idx} className="text-response">
                  {parsed.introduction && (
                    <div className="introduction markdown-content">
                      <Markdown remarkPlugins={[remarkGfm]}>{parsed.introduction}</Markdown>
                    </div>
                  )}

                  <div className="steps-container">
                    {parsed.steps.map((step, stepIdx) => (
                      <StepDisplay key={stepIdx} step={step} />
                    ))}
                  </div>

                  {parsed.conclusion && (
                    <div className="conclusion markdown-content">
                      <Markdown remarkPlugins={[remarkGfm]}>{parsed.conclusion}</Markdown>
                    </div>
                  )}
                </div>
              );
            }
            // No steps found, display as regular markdown
            return (
              <div key={idx} className="text-response markdown-content">
                <Markdown remarkPlugins={[remarkGfm]}>{parsed.rawText || cleanedText}</Markdown>
              </div>
            );
          }
          // Skip tool-result items (not displayed in UI)
          return null;
        })}

        {/* Result */}
        {message.result && (
          <div className={`result-line ${message.result.success ? "success" : "failure"}`}>
            <span className="result-icon">
              {message.result.success ? "✓" : "✗"}
            </span>
            <span className="markdown-content">
              <Markdown remarkPlugins={[remarkGfm]}>{message.result.text}</Markdown>
            </span>
          </div>
        )}

        {/* Error */}
        {message.error && (
          <div className="error-line">⚠ {message.error}</div>
        )}
      </div>
    </div>
  );
};
