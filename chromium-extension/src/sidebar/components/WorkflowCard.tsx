import React from "react";
import type { TaskData } from "../types";
import { RobotOutlined } from "@ant-design/icons";
import { Card, Space, Typography, Spin, Button } from "antd";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { buildAgentTree, WorkflowAgent } from "@openbrowser-ai/core";

const { Text, Paragraph } = Typography;

interface WorkflowCardProps {
  task: TaskData;
  onUpdateTask?: (status?: "stop") => void;
}

const sendWorkflowConfirmCallback = (
  callbackId: string,
  value: "confirm" | "cancel"
) => {
  chrome.runtime.sendMessage({
    type: "callback",
    data: { callbackId, value: value },
  });
};

export const WorkflowCard: React.FC<WorkflowCardProps> = ({
  task,
  onUpdateTask,
}) => {
  if (!task.workflow) return null;

  const workflow = task.workflow;
  const agents = workflow.agents;

  // Build agent tree structure
  const buildAgentGroups = () => {
    if (agents.length === 0) {
      return [];
    }
    const groups: WorkflowAgent[][] = [];
    let agentTree = buildAgentTree(agents);
    while (true) {
      if (agentTree.type === "normal") {
        groups.push([agentTree.agent]);
      } else {
        groups.push(agentTree.agents.map((a) => a.agent));
      }
      if (!agentTree.nextAgent) {
        break;
      }
      agentTree = agentTree.nextAgent;
    }
    return groups;
  };

  const agentGroups = buildAgentGroups();

  return (
    <div className="mt-4">
      <Card
        size="small"
        title={
          <Space>
            <RobotOutlined />
            <Text strong>Multi-Agent Workflow</Text>
            {!task.workflowStreamDone && <Spin size="small" />}
          </Space>
        }
        className="bg-blue-50"
      >
        {workflow.thought && (
          <Paragraph type="secondary" className="mb-4">
            {workflow.thought}
          </Paragraph>
        )}
        {agentGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="mb-4">
            {group.length === 1 ? (
              // Single agent
              <div>
                <AgentExecutionCard agentNode={group[0]} task={task} />
              </div>
            ) : (
              // Parallel agents
              <div>
                <Text strong className="text-blue-500">
                  [{group.map((a) => a.name).join(", ")}]
                </Text>
                <div className="ml-4 mt-2">
                  {group.map((agent) => (
                    <div key={agent.id} className="mb-2">
                      <AgentExecutionCard agentNode={agent} task={task} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {task.workflowConfirm === "pending" && (
          <div className="mt-4 flex justify-end gap-3">
            <Button
              onClick={() => {
                task.workflowConfirm = "cancel";
                sendWorkflowConfirmCallback(task.taskId, "cancel");
                onUpdateTask?.("stop");
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={() => {
                task.workflowConfirm = "confirm";
                sendWorkflowConfirmCallback(task.taskId, "confirm");
                onUpdateTask?.();
              }}
            >
              Confirm
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
