import React, { useMemo } from "react";
import { TextItem } from "./TextItem";
import type { ChatMessage } from "../types";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";
import { WorkflowCard } from "./WorkflowCard";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { Typography, Image, Spin } from "antd";
import { RobotOutlined, UserOutlined, FileOutlined, ExclamationCircleOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;

const decodeHtmlEntities = (text: string) => {
  if (!text) return "";
  if (typeof window === "undefined") {
    return text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
};

const renderContentWithWebRefs = (
  content: string,
  onWebRefClick: (url: string) => void
) => {
  if (!content) return null;
  const elements: React.ReactNode[] = [];
  const regex =
    /<span class="webpage-reference"[^>]*tab-id="([^"]+)"[^>]*url="([^"]+)"[^>]*>(.*?)<\/span>/gi;
  let lastIndex = 0;
  let keyIndex = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const normalized = text.replace(/<br\s*\/?>/gi, "\n");
    const decoded = decodeHtmlEntities(normalized);
    if (!decoded) return;
    const parts = decoded.split(/(\n)/);
    parts.forEach((part) => {
      if (!part) {
        return;
      }
      if (part === "\n") {
        elements.push(<br key={`br-${keyIndex++}`} />);
      } else {
        elements.push(
          <React.Fragment key={`text-${keyIndex++}`}>{part}</React.Fragment>
        );
      }
    });
  };

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [fullMatch, tabId, url, title] = match;
    if (match.index > lastIndex) {
      pushText(content.slice(lastIndex, match.index));
    }

    const decodedTitle = decodeHtmlEntities(title);
    const decodedUrl = decodeHtmlEntities(url);
    elements.push(
      <span
        key={`webref-${tabId || keyIndex}`}
        className="webpage-reference-display user-webpage-reference"
        onClick={() => onWebRefClick(decodedUrl)}
      >
        {`${decodedTitle}`}
      </span>
    );
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    pushText(content.slice(lastIndex));
  }

  if (elements.length === 0) {
    return decodeHtmlEntities(content);
  }

  return elements;
};

interface MessageItemProps {
  message: ChatMessage;
  onUpdateMessage?: (status?: "stop") => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onUpdateMessage,
}) => {
  const handleWebRefClick = (url: string) => {
    if (!url) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  const userContent = useMemo(
    () => renderContentWithWebRefs(message.content || "", handleWebRefClick),
    [message.content]
  );

  if (message.role === "user") {
    return (
      <div className="flex gap-3 mb-4">
        {/* User Icon */}
        <div className="flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
            <UserOutlined className="text-gray-600" />
          </div>
        </div>

        {/* User Content */}
        <div className="flex-1 min-w-0">
          {message.content && (
            <div className="text-gray-900 leading-relaxed text-sm">
              {userContent}
            </div>
          )}
          {message.status == "waiting" && (
            <Spin size="small" className="mt-1" />
          )}
          {message.uploadedFiles && message.uploadedFiles.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.uploadedFiles.map((file) => {
                const isImage = file.mimeType.startsWith("image/");
                return (
                  <div
                    key={file.id}
                    className="inline-block"
                  >
                    {isImage ? (
                      <Image
                        src={
                          file.url
                            ? file.url
                            : `data:${file.mimeType};base64,${file.base64Data}`
                        }
                        alt={file.filename}
                        className="max-w-full max-h-[200px] rounded border border-gray-200"
                        preview={false}
                      />
                    ) : (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded border border-gray-200">
                        <FileOutlined className="text-gray-500" />
                        <Text className="text-gray-700 text-sm">
                          {file.filename}
                        </Text>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex gap-3 mb-4">
      {/* AI Icon */}
      <div className="flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
          <RobotOutlined className="text-gray-600" />
        </div>
      </div>

      {/* AI Content */}
      <div className="flex-1 min-w-0">
        {message.contentItems && message.contentItems.length > 0 ? (
          message.contentItems.map((item, index) => {
            if (item.type === "thinking" && item.text != "[REDACTED]") {
              return (
                <div key={`chat-thinking-${item.streamId}-${index}`}>
                  <ThinkingItem
                    streamId={item.streamId}
                    text={item.text}
                    streamDone={item.streamDone}
                  />
                </div>
              );
            } else if (item.type === "text") {
              return (
                <div key={`chat-text-${item.streamId}-${index}`}>
                  <TextItem
                    streamId={item.streamId}
                    text={item.text}
                    streamDone={item.streamDone}
                  />
                </div>
              );
            } else if (item.type === "tool") {
              return (
                <div
                  key={`chat-tool-${item.toolCallId}-${index}`}
                  className="mb-2"
                >
                  <ToolCallItem item={item} />
                </div>
              );
            } else if (item.type === "file") {
              return (
                <Image
                  key={`chat-file-${index}`}
                  src={
                    item.data.startsWith("http")
                      ? item.data
                      : `data:${item.mimeType};base64,${item.data}`
                  }
                  alt="Message file"
                  className="max-w-full my-2 rounded border border-gray-200"
                />
              );
            } else if (
              item.type === "task" &&
              (item.task.workflow || item.task.agents?.length > 0)
            ) {
              return (
                <div
                  key={`chat-task-${item.taskId}-${index}`}
                  className="mb-2"
                >
                  {item.task.workflow ? (
                    // Multi-agent workflow
                    <WorkflowCard task={item.task} onUpdateTask={onUpdateMessage} />
                  ) : (
                    // Single agent tool
                    <AgentExecutionCard
                      agentNode={item.task.agents[0].agentNode}
                      task={item.task}
                    />
                  )}
                </div>
              );
            }
            return null;
          })
        ) : message.content ? (
          <div className="mb-2 text-gray-900 leading-relaxed text-sm">
            <MarkdownRenderer content={message.content} />
          </div>
        ) : message.status == "waiting" ? (
          <Spin size="small" />
        ) : (
          <></>
        )}
        {message.error && (
          <div className="mt-2 flex items-start gap-2 text-sm text-red-600">
            <ExclamationCircleOutlined className="mt-0.5" />
            <span>{String(message.error)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
