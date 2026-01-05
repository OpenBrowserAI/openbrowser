import { OpenBrowserMessage, WebSearchResult } from "../types";

export default interface ChatService {
  loadMessages(chatId: string): Promise<OpenBrowserMessage[]>;

  addMessage(chatId: string, messages: OpenBrowserMessage[]): Promise<void>;

  memoryRecall(chatId: string, prompt: string): Promise<string>;

  uploadFile(
    file: { base64Data: string; mimeType: string; filename?: string },
    chatId: string,
    taskId?: string | undefined // messageId
  ): Promise<{
    fileId: string;
    url: string;
  }>;

  websearch?(
    chatId: string,
    options: {
      query: string;
      numResults?: number;
      livecrawl?: "fallback" | "preferred";
      type?: "auto" | "fast" | "deep";
      contextMaxCharacters?: number;
    }
  ): Promise<WebSearchResult[]>;
}

export type { ChatService };
