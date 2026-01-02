import OpenBrowser from "../agent";
import { OpenBrowserDialogueConfig } from "../types";

export class ChatContext {
  protected chatId: string;
  protected config: OpenBrowserDialogueConfig;
  protected openbrowserMap: Map<string, OpenBrowser>;
  protected globalVariables: Map<string, any>;

  constructor(chatId: string, config: OpenBrowserDialogueConfig) {
    this.chatId = chatId;
    this.config = config;
    this.openbrowserMap = new Map<string, OpenBrowser>();
    this.globalVariables = new Map<string, any>();
  }

  public getChatId(): string {
    return this.chatId;
  }
  public getConfig(): OpenBrowserDialogueConfig {
    return this.config;
  }
  public addOpenBrowser(taskId: string, openbrowser: OpenBrowser): void {
    this.openbrowserMap.set(taskId, openbrowser);
  }
  public getOpenBrowser(taskId: string): OpenBrowser | undefined {
    return this.openbrowserMap.get(taskId);
  }
  public getGlobalVariables(): Map<string, any> {
    return this.globalVariables;
  }
}
