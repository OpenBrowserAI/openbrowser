import { Agent } from "./base";
import { mergeTools } from "../common/utils";
import { AgentContext } from "../core/context";
import { Tool, ToolResult, IMcpClient } from "../types";

export const AGENT_NAME = "Shell";

export default abstract class BaseShellAgent extends Agent {
  constructor(
    llms?: string[],
    ext_tools?: Tool[],
    mcpClient?: IMcpClient,
    planDescription?: string
  ) {
    const _tools_ = [] as Tool[];
    super({
      name: AGENT_NAME,
      description: `Run commands in a bash shell,
* You must first call create_session to create a new session when using it for the first time.
* Please execute delete commands with caution, and never perform dangerous operations like \`rm -rf /\`.
* Please avoid commands that may produce a very large amount of output.`,
      tools: _tools_,
      llms: llms,
      mcpClient: mcpClient,
      planDescription: planDescription || "Shell command agent, use to execute shell commands.",
    });
    let init_tools = this.buildInitTools();
    if (ext_tools && ext_tools.length > 0) {
      init_tools = mergeTools(init_tools, ext_tools);
    }
    init_tools.forEach((tool) => _tools_.push(tool));
  }

  protected abstract create_session(
    agentContext: AgentContext,
    exec_dir: string
  ): Promise<{
    session_id: string;
  }>;

  protected abstract shell_exec(
    agentContext: AgentContext,
    session_id: string,
    command: string
  ): Promise<string>;

  protected abstract close_session(
    agentContext: AgentContext,
    session_id: string
  ): Promise<void>;

  private buildInitTools(): Tool[] {
    return [
      {
        name: "create_session",
        description: "Create a new shell session",
        parameters: {
          type: "object",
          properties: {
            exec_dir: {
              type: "string",
              description:
                "Working directory for command execution (absolute path)",
            },
          },
          required: ["exec_dir"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.create_session(agentContext, args.exec_dir as string)
          );
        },
      },
      {
        name: "shell_exec",
        description: "Execute commands in a specified shell session",
        parameters: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "shell session id",
            },
            command: {
              type: "string",
              description: "Shell command to execute",
            },
          },
          required: ["session_id", "command"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.shell_exec(
              agentContext,
              args.session_id as string,
              args.command as string
            )
          );
        },
      },
      {
        name: "close_session",
        description: "Close shell session",
        parameters: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "shell session id",
            },
          },
          required: ["session_id"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.close_session(agentContext, args.session_id as string)
          );
        },
      },
    ];
  }
}

export { BaseShellAgent };
