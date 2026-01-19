import React, { useState } from "react";
import { TextItem } from "./TextItem";
import { HumanCard } from "./HumanCard";
import type { TaskData } from "../types";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";
import type { WorkflowAgent } from "@openbrowser-ai/core/types";
import { Collapse, Typography, Alert, Image } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined
} from "@ant-design/icons";

const { Text } = Typography;

interface AgentExecutionCardProps {
  agentNode: WorkflowAgent;
  task: TaskData;
}

export const AgentExecutionCard: React.FC<AgentExecutionCardProps> = ({
  agentNode,
  task
}) => {
  const agent = task.agents.find((a) => a.agentNode.id === agentNode.id);
  const status = agent?.status || agentNode.status;
  const [respondedCallbacks, setRespondedCallbacks] = useState<Set<string>>(
    new Set()
  );

  const handleHumanResponse = (callbackId: string, value: any) => {
    setRespondedCallbacks((prev) => new Set(prev).add(callbackId));
    // Update the item in agent.contentItems
    if (agent) {
      const itemIndex = agent.contentItems.findIndex(
        (item) =>
          (item.type === "human_confirm" ||
            item.type === "human_input" ||
            item.type === "human_select" ||
            item.type === "human_help") &&
          item.callbackId === callbackId
      );
      if (itemIndex >= 0) {
        (agent.contentItems[itemIndex] as any).value = value;
        (agent.contentItems[itemIndex] as any).responded = true;
      }
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(true);
  const activeKey = status === "running" ? ["agent"] : undefined;

  React.useEffect(() => {
    if (status === "running") {
      setIsCollapsed(false);
    }
  }, [status]);

  const getStatusIcon = () => {
    if (status === "running")
      return <LoadingOutlined className="text-blue-500" spin />;
    if (status === "done")
      return <CheckCircleOutlined className="text-green-500" />;
    if (status === "error")
      return <CloseCircleOutlined className="text-red-500" />;
    return null;
  };

  const getBorderColor = () => {
    if (status === "done") return "border-l-green-500";
    if (status === "error") return "border-l-red-500";
    if (status === "running") return "border-l-blue-500";
    return "border-l-gray-300";
  };

  return (
    <Collapse
      size="small"
      className={`agent-collapse mb-2 border-l-4 ${getBorderColor()} bg-theme-input border-theme-input`}
      activeKey={activeKey}
      onChange={(keys) => {
        setIsCollapsed(!(keys as string[]).includes("agent"));
      }}
      items={[
        {
          key: "agent",
          label: (
            <div className="flex items-center gap-2 w-full overflow-hidden">
              <div
                className={`flex-1 min-w-0 ${
                  isCollapsed ? "truncate" : "whitespace-normal"
                }`}
              >
                <Text strong className="text-sm text-theme-primary">
                  {agentNode.task || agentNode.name}
                </Text>
              </div>
              <div className="flex-shrink-0">{getStatusIcon()}</div>
            </div>
          ),
          children: (
            <div>
              {agent && (
                <>
                  {/* Render content in order of appearance */}
                  {agent.contentItems.map((item, index) => {
                    if (item.type === "thinking" && item.text != "[REDACTED]") {
                      return (
                        <div key={`thinking-${item.streamId}-${index}`}>
                          <ThinkingItem
                            streamId={item.streamId}
                            text={item.text}
                            streamDone={item.streamDone}
                          />
                        </div>
                      );
                    } else if (item.type === "text") {
                      return (
                        <div key={`text-${item.streamId}-${index}`}>
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
                          key={`tool-${item.toolCallId}-${index}`}
                          className="mb-2"
                        >
                          <ToolCallItem item={item} />
                        </div>
                      );
                    } else if (item.type === "file") {
                      return (
                        <Image
                          key={`file-${index}`}
                          src={
                            item.data.startsWith("http")
                              ? item.data
                              : `data:${item.mimeType};base64,${item.data}`
                          }
                          alt="Agent file"
                          className="max-w-full my-2"
                        />
                      );
                    } else if (item.type === "human_confirm") {
                      const isResponded =
                        respondedCallbacks.has(item.callbackId) ||
                        item.responded;
                      return (
                        <div key={`human-confirm-${item.callbackId}-${index}`}>
                          <HumanCard
                            item={{ ...item, responded: isResponded }}
                            onRespond={(value: any) =>
                              handleHumanResponse(item.callbackId, value)
                            }
                          />
                        </div>
                      );
                    } else if (item.type === "human_input") {
                      const isResponded =
                        respondedCallbacks.has(item.callbackId) ||
                        item.responded;
                      return (
                        <div key={`human-input-${item.callbackId}-${index}`}>
                          <HumanCard
                            item={{ ...item, responded: isResponded }}
                            onRespond={(value: any) =>
                              handleHumanResponse(item.callbackId, value)
                            }
                          />
                        </div>
                      );
                    } else if (item.type === "human_select") {
                      const isResponded =
                        respondedCallbacks.has(item.callbackId) ||
                        item.responded;
                      return (
                        <div key={`human-select-${item.callbackId}-${index}`}>
                          <HumanCard
                            item={{ ...item, responded: isResponded }}
                            onRespond={(value: any) =>
                              handleHumanResponse(item.callbackId, value)
                            }
                          />
                        </div>
                      );
                    } else if (item.type === "human_help") {
                      const isResponded =
                        respondedCallbacks.has(item.callbackId) ||
                        item.responded;
                      return (
                        <div key={`human-help-${item.callbackId}-${index}`}>
                          <HumanCard
                            item={{ ...item, responded: isResponded }}
                            onRespond={(value: any) =>
                              handleHumanResponse(item.callbackId, value)
                            }
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                  {/* {agent.result && (
            <Alert
              message="Execution Result"
              description={<MarkdownRenderer content={agent.result} />}
              type="success"
              style={{ marginTop: 8 }}
            />
          )} */}
                  {agent.error && (
                    <Alert
                      message="Execution Error"
                      description={
                        agent.error.name
                          ? agent.error.name + ": " + agent.error.message
                          : String(agent.error)
                      }
                      type="error"
                      className="mt-2"
                    />
                  )}
                </>
              )}
            </div>
          )
        }
      ]}
    />
  );
};
