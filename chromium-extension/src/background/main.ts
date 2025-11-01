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

export async function main(prompt: string): Promise<OpenBrowser> {
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
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "workflow",
          workflow: message.workflow.xml,
          streamDone: message.streamDone
        });
      } else if (message.type == "text") {
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "text",
          text: message.text,
          streamDone: message.streamDone
        });
      } else if (message.type == "tool_streaming") {
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "tool_streaming",
          agentName: message.agentName,
          toolName: message.toolName,
          paramsText: message.paramsText
        });
      } else if (message.type == "tool_use") {
        chrome.runtime.sendMessage({
          type: "message",
          messageType: "tool_use",
          agentName: message.agentName,
          toolName: message.toolName,
          params: message.params
        });
      }
      console.log("message: ", JSON.stringify(message, null, 2));
    },
    onHumanConfirm: async (context, prompt) => {
      return doConfirm(prompt);
    }
  };

  let agents = [new BrowserAgent()];
  let openbrowser = new OpenBrowser({ llms, agents, callback });
  openbrowser
    .run(prompt)
    .then((res) => {
      chrome.runtime.sendMessage({
        type: "message",
        messageType: "result",
        text: res.result,
        success: res.success
      });
    })
    .catch((error) => {
      chrome.runtime.sendMessage({
        type: "message",
        messageType: "error",
        text: error.toString()
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
