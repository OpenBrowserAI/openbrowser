import React from "react";
import type { TaskData } from "../types";
import { Button, Typography } from "antd";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { ThinkingItem } from "./ThinkingItem";
import { buildAgentTree, WorkflowAgent } from "@openbrowser-ai/core";

const { Text } = Typography;

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
    data: { callbackId, value: value }
  });
};

export const WorkflowCard: React.FC<WorkflowCardProps> = ({
  task,
  onUpdateTask
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
    <div>
      {workflow.thought && (
        <div className="mb-2">
          <ThinkingItem
            streamId={`workflow-${task.taskId}`}
            text={workflow.thought}
            streamDone={task.workflowStreamDone ?? true}
          />
        </div>
      )}
      {task.workflowConfirm === "pending" && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded flex justify-between items-center">
          <Text className="text-sm text-gray-700">Execute this workflow?</Text>
          <div className="flex gap-2">
            <Button
              size="small"
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
              size="small"
              onClick={() => {
                task.workflowConfirm = "confirm";
                sendWorkflowConfirmCallback(task.taskId, "confirm");
                onUpdateTask?.();
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
      {agentGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="mb-2">
          {group.length === 1 ? (
            <AgentExecutionCard agentNode={group[0]} task={task} />
          ) : (
            <div>
              <div className="mb-1 text-xs text-gray-500 italic">
                Running in parallel: {group.map((a) => a.name).join(", ")}
              </div>
              {group.map((agent) => (
                <div key={agent.id} className="mb-2">
                  <AgentExecutionCard agentNode={agent} task={task} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
