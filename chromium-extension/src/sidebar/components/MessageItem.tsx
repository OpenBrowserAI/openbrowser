import React, { useMemo } from "react";
import { TextItem } from "./TextItem";
import type { ChatMessage } from "../types";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";
import { WorkflowCard } from "./WorkflowCard";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { Card, Space, Typography, Alert, Image, Spin } from "antd";
import { RobotOutlined, UserOutlined, FileOutlined } from "@ant-design/icons";

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
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
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
      <div className="flex justify-end mb-4">
        <Card
          className="max-w-[70%] bg-blue-500 text-white"
          styles={{
            body: { padding: "12px 16px" },
          }}
        >
          <Space direction="vertical" size="small" className="w-full">
            {(message.content || message.uploadedFiles?.length) && (
              <Space>
                <UserOutlined />
                {message.content && (
                  <Paragraph className="m-0 text-white">
                    {userContent}
                  </Paragraph>
                )}
                {message.status == "waiting" && (
                  <Spin size="small" className="text-white" />
                )}
              </Space>
            )}
            {message.uploadedFiles && message.uploadedFiles.length > 0 && (
              <div className="mt-2">
                {message.uploadedFiles.map((file) => {
                  const isImage = file.mimeType.startsWith("image/");
                  return (
                    <div
                      key={file.id}
                      className="mb-2 p-2 bg-white/20 rounded"
                    >
                      {isImage ? (
                        <Image
                          src={
                            file.url
                              ? file.url
                              : `data:${file.mimeType};base64,${file.base64Data}`
                          }
                          alt={file.filename}
                          className="max-w-full max-h-[200px] rounded"
                          preview={false}
                        />
                      ) : (
                        <Space>
                          <FileOutlined className="text-white" />
                          <Text className="text-white text-xs">
                            {file.filename}
                          </Text>
                        </Space>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Space>
        </Card>
      </div>
    );
  }

  // AI message
  return (
    <div className="mb-4">
      <Card
        className="bg-gray-50"
        title={
          <Space>
            <RobotOutlined />
            <Text strong>AI Assistant</Text>
          </Space>
        }
      >
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
                  className="max-w-full my-2"
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
                    <WorkflowCard task={item.task} />
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
          <div className="mb-2">
            <MarkdownRenderer content={message.content} />
          </div>
        ) : message.status == "waiting" ? (
          <Spin size="small" />
        ) : (
          <></>
        )}
        {message.error && (
          <Alert
            message="Error"
            description={String(message.error)}
            type="error"
            className="mt-2"
          />
        )}
      </Card>
    </div>
  );
};
