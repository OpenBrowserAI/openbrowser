import React from "react";
import {
  ToolOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { isJsonStr } from "../utils";
import type { ChatContentItem } from "../types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Typography, Tag, Collapse, Image, Spin } from "antd";

const { Text, Paragraph } = Typography;

interface ToolCallItemProps {
  item: ChatContentItem & { type: "tool" };
}

export const ToolCallItem: React.FC<ToolCallItemProps> = ({ item }) => {
  // Determine status icon
  const getStatusIcon = () => {
    if (item.running) {
      return <LoadingOutlined className="text-blue-500" spin />;
    }
    if (item.result) {
      return item.result.isError ? (
        <CloseCircleOutlined className="text-red-500" />
      ) : (
        <CheckCircleOutlined className="text-green-500" />
      );
    }
    return null;
  };

  return (
    <Collapse
      size="small"
      className="tool-call-collapse"
      defaultActiveKey={[]}
      items={[
        {
          key: "tool",
          label: (
            <div className="flex items-center gap-2">
              <ToolOutlined className="text-gray-500" />
              <Text className="text-sm text-gray-700">{item.toolName}</Text>
              {getStatusIcon()}
            </div>
          ),
          children: (
            <div className="pl-1">
              {/* Streaming params text */}
              {item.paramsText && !item.params && (
                <div className="mb-2">
                  <Text type="secondary" code className="text-xs">
                    {item.paramsText}
                    <span className="streaming-cursor">|</span>
                  </Text>
                </div>
              )}

              {/* Parameters */}
              {item.params && (
                <div className="mb-3">
                  <Text strong className="text-xs text-gray-600">
                    Parameters
                  </Text>
                  <pre className="tool-json-pre mt-1 text-xs">
                    {JSON.stringify(item.params, null, 2)}
                  </pre>
                </div>
              )}

              {/* Running text */}
              {item.running && item.runningText && (
                <div className="mb-2">
                  <Text type="secondary" className="text-sm">
                    <MarkdownRenderer content={item.runningText} />
                  </Text>
                </div>
              )}

              {/* Result */}
              {item.result && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Text strong className="text-xs text-gray-600">
                      Result
                    </Text>
                    {item.result.isError && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                        <CloseCircleOutlined />
                        Failed
                      </span>
                    )}
                  </div>
                  <div>
                    {item.result.content.map((part, index) => {
                      if (part.type === "text") {
                        return isJsonStr(part.text) ? (
                          <pre key={index} className="tool-json-pre text-xs">
                            {JSON.stringify(JSON.parse(part.text), null, 2)}
                          </pre>
                        ) : (
                          <div key={index} className="text-sm">
                            <MarkdownRenderer content={part.text} />
                          </div>
                        );
                      } else if (part.type === "image") {
                        return (
                          <Image
                            key={index}
                            src={
                              part.data.startsWith("http")
                                ? part.data
                                : `data:${part.mimeType || "image/png"};base64,${
                                    part.data
                                  }`
                            }
                            alt="Tool result"
                            className="max-w-full mt-2 rounded border border-gray-200"
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}
            </div>
          ),
        },
      ]}
    />
  );
};
