import { config, global } from "@openbrowser-ai/core";
import { SimpleChatService } from "./chat-service";
import { SimpleBrowserService } from "./browser-service";

export function initAgentServices() {
  config.workflowConfirm = false;
  global.browserService = new SimpleBrowserService();
  global.chatService = new SimpleChatService();
}
