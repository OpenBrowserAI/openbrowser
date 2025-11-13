import { config, OpenBrowser } from "@openbrowser-ai/core";
import { main } from "./main";

var openbrowser: OpenBrowser;

chrome.storage.local.set({ running: false });

// Listen to messages from the browser extension
chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  if (request.type == "run") {
    try {
      // Run workflow with conversation history context
      openbrowser = await main(request.prompt, request.context || [], request.sessionId);
    } catch (e) {
      console.error(e);
      chrome.runtime.sendMessage({
        type: "message",
        messageType: "error",
        text: e.toString(),
        sessionId: request.sessionId
      });
    }
    return;
  }
  if (request.type == "update_mode") {
    config.mode = request.mode;
    config.markImageMode = request.markImageMode;
    return;
  }
  if (request.type == "stop") {
    if (openbrowser) {
      openbrowser.getAllTaskId().forEach((taskId) => {
        openbrowser.abortTask(taskId);
      });
    }
    chrome.storage.local.set({ running: false });
    chrome.runtime.sendMessage({ type: "stop" });
  }
});

(chrome as any).sidePanel &&
  (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
