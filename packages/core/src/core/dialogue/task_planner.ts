import { JSONSchema7 } from "json-schema";
import { OpenBrowser } from "../openbrowser";
import { OpenBrowserDialogue } from "../dialogue";
import { DialogueParams, DialogueTool, ToolResult } from "../../types";

export const TOOL_NAME = "taskPlanner";

export default class TaskPlannerTool implements DialogueTool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  private openbrowserDialogue: OpenBrowserDialogue;
  private params: DialogueParams;

  constructor(
    openbrowserDialogue: OpenBrowserDialogue,
    params: DialogueParams
  ) {
    const agents = openbrowserDialogue.getConfig().agents || [];
    const agentNames = agents.map((agent) => agent.Name).join(", ");
    this.description = `Used for task planning, this tool is only responsible for generating task plans, not executing them, the following agents are available: ${agentNames}...`;
    this.parameters = {
      type: "object",
      properties: {
        taskDescription: {
          type: "string",
          description:
            "Task description, Do not omit any information from the user's question, maintain the task as close to the user's input as possible, and use the same language as the user's question."
        },
        oldTaskId: {
          type: "string",
          description:
            "Previous task ID, modifications based on the previously planned task."
        }
      },
      required: ["taskDescription"]
    };
    this.params = params;
    this.openbrowserDialogue = openbrowserDialogue;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const taskDescription = args.taskDescription as string;
    const oldTaskId = args.oldTaskId as string;
    if (oldTaskId) {
      const openbrowser = this.openbrowserDialogue.getOpenBrowser(oldTaskId);
      if (openbrowser) {
        // modify the old action plan
        const workflow = await openbrowser.modify(oldTaskId, taskDescription);
        const taskPlan = workflow.xml;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                taskId: oldTaskId,
                taskPlan: taskPlan
              })
            }
          ]
        };
      }
    }
    // generate a new action plan
    const taskId = this.params.messageId as string;
    const openbrowser = new OpenBrowser({
      ...this.openbrowserDialogue.getConfig(),
      callback: this.params.callback?.taskCallback
    });
    const workflow = await openbrowser.generate(
      taskDescription,
      taskId,
      this.openbrowserDialogue.getGlobalContext()
    );
    this.openbrowserDialogue.addOpenBrowser(taskId, openbrowser);
    const taskPlan = workflow.xml;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            taskId: taskId,
            taskPlan: taskPlan
          })
        }
      ]
    };
  }
}

export { TaskPlannerTool as ActionPlannerTool };
