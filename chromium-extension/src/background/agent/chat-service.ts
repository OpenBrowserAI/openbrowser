import { ChatService, uuidv4, ExaSearchService } from "@openbrowser-ai/core";
import {
  OpenBrowserMessage,
  WebSearchResult
} from "@openbrowser-ai/core/types";
import { dbService } from "../../db/db-service";

export class SimpleChatService implements ChatService {
  websearch?: (
    chatId: string,
    options: {
      query: string;
      numResults?: number;
      livecrawl?: "fallback" | "preferred";
      type?: "auto" | "fast" | "deep";
      contextMaxCharacters?: number;
    }
  ) => Promise<WebSearchResult[]>;

  constructor() {
    chrome.storage.sync.get(["webSearchConfig"], (result) => {
      if (result.webSearchConfig?.enabled) {
        this.websearch = (chatId, options) =>
          this.websearchImpl(chatId, result.webSearchConfig.apiKey, options);
      }
    });
  }

  async loadMessages(chatId: string): Promise<OpenBrowserMessage[]> {
    return await dbService.loadMessages(chatId);
  }

  async addMessage(
    chatId: string,
    messages: OpenBrowserMessage[]
  ): Promise<void> {
    await dbService.saveMessages(chatId, messages);
  }

  memoryRecall(chatId: string, prompt: string): Promise<string> {
    return Promise.resolve("");
  }

  async uploadFile(
    file: { base64Data: string; mimeType: string; filename?: string },
    chatId: string,
    taskId?: string | undefined
  ): Promise<{
    fileId: string;
    url: string;
  }> {
    return Promise.resolve({
      fileId: uuidv4(),
      url: file.base64Data.startsWith("data:")
        ? file.base64Data
        : `data:${file.mimeType};base64,${file.base64Data}`
    });
  }

  private async websearchImpl(
    chatId: string,
    apiKey: string | undefined,
    options: {
      query: string;
      numResults?: number;
      livecrawl?: "fallback" | "preferred";
      type?: "auto" | "fast" | "deep";
      contextMaxCharacters?: number;
    }
  ): Promise<WebSearchResult[]> {
    try {
      const content = await ExaSearchService.search(
        {
          query: options.query,
          numResults: options.numResults || 8,
          type: options.type || "auto",
          livecrawl: options.livecrawl || "fallback",
          contextMaxCharacters: options.contextMaxCharacters || 10000
        },
        apiKey
      );

      return [
        {
          title: `Web search: ${options.query}`,
          url: "",
          snippet: "",
          content: content
        }
      ];
    } catch (error) {
      console.error("Web search failed:", error);
      return [];
    }
  }
}
