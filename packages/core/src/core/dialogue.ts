import Log from "../common/log";
import {
  OpenBrowserMessage,
  ToolResult,
  DialogueTool,
  DialogueParams,
  DialogueCallback,
  OpenBrowserDialogueConfig,
  OpenBrowserMessageUserPart,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart
} from "../types";
import {
  callChatLLM,
  convertToolResults,
  convertUserContent,
  convertAssistantToolResults
} from "./dialogue/llm";
import { OpenBrowser } from "./openbrowser";
import TaskPlannerTool, {
  TOOL_NAME as task_planner
} from "./dialogue/task_planner";
import { RetryLanguageModel } from "../llm";
import { OpenBrowserMemory } from "../memory/memory";
import ExecuteTaskTool from "./dialogue/execute_task";
import { getDialogueSystemPrompt } from "../prompt/dialogue";
import TaskVariableStorageTool from "./dialogue/variable_storage";
import { convertTools, getTool, convertToolResult } from "../agent/llm";

export class OpenBrowserDialogue {
  protected memory: OpenBrowserMemory;
  protected tools: DialogueTool[];
  protected config: OpenBrowserDialogueConfig;
  protected openbrowserMap: Map<string, OpenBrowser>;
  protected globalContext: Map<string, any>;

  constructor(
    config: OpenBrowserDialogueConfig,
    memory?: OpenBrowserMemory,
    tools?: DialogueTool[]
  ) {
    this.config = config;
    this.tools = tools ?? [];
    this.openbrowserMap = new Map<string, OpenBrowser>();
    this.globalContext = new Map<string, any>();
    this.memory = memory ?? new OpenBrowserMemory(getDialogueSystemPrompt());
  }

  public async chat(params: DialogueParams): Promise<string> {
    return this.doChat(params, false);
  }

  public async segmentedExecution(
    params: Omit<DialogueParams, "user">
  ): Promise<string> {
    const messages = this.memory.getMessages();
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage.role !== "tool" ||
      !lastMessage.content.some((part) => part.toolName === task_planner)
    ) {
      throw new Error("No task planner tool call found");
    }
    const userMessages = messages.filter((message) => message.role === "user");
    const lastUserMessage = userMessages[userMessages.length - 1];
    if (!lastUserMessage) {
      throw new Error("No user message found");
    }
    return this.doChat(
      {
        ...params,
        user: lastUserMessage.content as string | OpenBrowserMessageUserPart[],
        callback: params.callback,
        messageId: params.messageId || lastUserMessage.id,
        signal: params.signal
      },
      true
    );
  }

  private async doChat(
    params: DialogueParams,
    segmentedExecution: boolean
  ): Promise<string> {
    if (!segmentedExecution) {
      params.messageId = params.messageId ?? this.memory.genMessageId();
      await this.addUserMessage(params.user, params.messageId);
    }
    const rlm = new RetryLanguageModel(this.config.llms, this.config.chatLlms);
    for (let i = 0; i < 15; i++) {
      const messages = this.memory.buildMessages();
      const chatTools = [...this.buildInnerTools(params), ...this.tools];
      const results = await callChatLLM(
        params.messageId as string,
        rlm,
        messages,
        convertTools(chatTools),
        undefined,
        0,
        params.callback,
        params.signal
      );
      const finalResult = await this.handleCallResult(
        chatTools,
        results,
        params.callback
      );
      if (finalResult) {
        return finalResult;
      }
      if (
        this.config.segmentedExecution &&
        results.some((r) => r.type == "tool-call" && r.toolName == task_planner)
      ) {
        return "segmentedExecution";
      }
    }
    return "Unfinished";
  }

  protected async addUserMessage(
    user: string | OpenBrowserMessageUserPart[],
    messageId: string
  ): Promise<OpenBrowserMessage> {
    const message: OpenBrowserMessage = {
      id: messageId,
      role: "user",
      timestamp: Date.now(),
      content: user
    };
    await this.memory.addMessages([message]);
    return message;
  }

  protected buildInnerTools(params: DialogueParams): DialogueTool[] {
    return [
      new TaskPlannerTool(this, params),
      new ExecuteTaskTool(this),
      new TaskVariableStorageTool(this)
    ];
  }

  public addOpenBrowser(taskId: string, openbrowser: OpenBrowser): void {
    this.openbrowserMap.set(taskId, openbrowser);
  }

  public getOpenBrowser(taskId: string): OpenBrowser | undefined {
    return this.openbrowserMap.get(taskId);
  }

  public getGlobalContext(): Map<string, any> {
    return this.globalContext;
  }

  public getConfig(): OpenBrowserDialogueConfig {
    return this.config;
  }

  protected async handleCallResult(
    chatTools: DialogueTool[],
    results: Array<LanguageModelV2TextPart | LanguageModelV2ToolCallPart>,
    dialogueCallback?: DialogueCallback
  ): Promise<string | null> {
    let text: string | null = null;
    const user_messages: LanguageModelV2Prompt = [];
    const toolResults: LanguageModelV2ToolResultPart[] = [];
    if (results.length == 0) {
      return null;
    }
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.type == "text") {
        text = result.text;
        continue;
      }
      let toolResult: ToolResult;
      try {
        const args =
          typeof result.input == "string"
            ? JSON.parse(result.input || "{}")
            : result.input || {};
        const tool = getTool(chatTools, result.toolName);
        if (!tool) {
          throw new Error(result.toolName + " tool does not exist");
        }
        toolResult = await tool.execute(args, result);
      } catch (e) {
        Log.error("tool call error: ", result.toolName, result.input, e);
        toolResult = {
          content: [
            {
              type: "text",
              text: e + ""
            }
          ],
          isError: true
        };
      }
      const callback = dialogueCallback?.chatCallback;
      if (callback) {
        await callback.onMessage({
          type: "tool_result",
          toolId: result.toolCallId,
          toolName: result.toolName,
          params: result.input || {},
          toolResult: toolResult
        });
      }
      const llmToolResult = convertToolResult(
        result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
    }
    await this.memory.addMessages([
      {
        id: this.memory.genMessageId(),
        role: "assistant",
        timestamp: Date.now(),
        content: convertAssistantToolResults(results)
      }
    ]);
    if (toolResults.length > 0) {
      await this.memory.addMessages([
        {
          id: this.memory.genMessageId(),
          role: "tool",
          timestamp: Date.now(),
          content: convertToolResults(toolResults)
        }
      ]);
      for (let i = 0; i < user_messages.length; i++) {
        const message = user_messages[i];
        if (message.role == "user") {
          await this.memory.addMessages([
            {
              id: this.memory.genMessageId(),
              role: "user",
              timestamp: Date.now(),
              content: convertUserContent(message.content)
            }
          ]);
        }
      }
      return null;
    } else {
      return text;
    }
  }
}
