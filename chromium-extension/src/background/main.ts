import {
  OpenBrowser,
  LLMs,
  StreamCallbackMessage,
  StreamCallback,
  HumanCallback
} from "@openbrowser-ai/core";
import { BrowserAgent } from "@openbrowser-ai/extension";

export async function getLLMConfig(name: string = "llmConfig"): Promise<any> {
  let result = await chrome.storage.sync.get([name]);
  return result[name];
}

export async function main(prompt: string, context: any[] = [], sessionId?: string): Promise<OpenBrowser> {
  let config = await getLLMConfig();
  if (!config || !config.apiKey) {
    chrome.runtime.sendMessage({
      type: "message",
      messageType: "error",
      text: "Please configure apiKey in the extension options."
    });
    chrome.runtime.openOptionsPage();
    chrome.storage.local.set({ running: false });
    chrome.runtime.sendMessage({ type: "stop" });
    return;
  }

  const llms: LLMs = {
    default: {
      provider: config.llm as any,
      model: config.modelName,
      apiKey: config.apiKey,
      config: {
        baseURL: config.options.baseURL
      }
    }
  };

  let callback: StreamCallback & HumanCallback = {
    onMessage: async (message: StreamCallbackMessage) => {
      // Send structured messages to UI instead of plain text
      if (message.type == "workflow") {
        // Handle null workflow gracefully
        if (message.workflow && message.workflow.xml) {
          chrome.runtime.sendMessage({
            type: "message",
            messageType: "workflow",
            workflow: message.workflow.xml,
            streamDone: message.streamDone,
            sessionId: sessionId
          });
        }
        return;
      }
      if (message.type == "text") {
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "text",
          text: message.text,
          streamDone: message.streamDone,
          sessionId: sessionId
        });
        return;
      }
      if (message.type == "tool_streaming") {
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "tool_streaming",
          agentName: message.agentName,
          toolName: message.toolName,
          paramsText: message.paramsText,
          sessionId: sessionId
        });
        return;
      }
      if (message.type == "tool_use") {
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "tool_use",
          agentName: message.agentName,
          toolName: message.toolName,
          toolId: message.toolId,
          params: message.params,
          sessionId: sessionId
        });
        return;
      }
      if (message.type == "tool_result") {
        chrome.runtime.sendMessage({
          type: "tool_result",
          agentName: message.agentName,
          nodeId: message.nodeId,
          toolName: message.toolName,
          toolId: message.toolId,
          params: message.params,
          toolResult: message.toolResult,
          sessionId: sessionId
        });
        return;
      }
      if (message.type == "agent_result") {
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "result",
          text: message.result || "",
          success: !message.error,
          sessionId: sessionId
        });
      }
    },
    onHumanConfirm: async (context, prompt) => {
      return doConfirm(prompt);
    }
  };

  let agents = [new BrowserAgent()];
  let openbrowser = new OpenBrowser({ llms, agents, callback });
  openbrowser
    .run(prompt, undefined, { conversationHistory: context })
    .then((res) => {
      chrome.runtime.sendMessage({
        type: "message",
        messageType: "result",
        text: res.result,
        success: res.success,
        sessionId: sessionId
      });
    })
    .catch((error) => {
      chrome.runtime.sendMessage({
        type: "message",
        messageType: "error",
        text: error.toString(),
        sessionId: sessionId
      });
    })
    .finally(() => {
      chrome.storage.local.set({ running: false });
      chrome.runtime.sendMessage({ type: "stop" });
    });
  return openbrowser;
}

async function doConfirm(prompt: string) {
  let tabs = (await chrome.tabs.query({
    active: true,
    windowType: "normal"
  })) as any[];
  let frameResults = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: (prompt) => {
      return window.confirm(prompt);
    },
    args: [prompt]
  });
  return frameResults[0].result;
}
