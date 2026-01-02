import { ChatService, uuidv4 } from "@openbrowser-ai/core";
import { OpenBrowserMessage, WebSearchResult } from "@openbrowser-ai/core/types";
import { dbService } from "../../db/db-service";

export class SimpleChatService implements ChatService {
  async loadMessages(chatId: string): Promise<OpenBrowserMessage[]> {
    return await dbService.loadMessages(chatId);
  }

  async addMessage(chatId: string, messages: OpenBrowserMessage[]): Promise<void> {
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
      url: file.base64Data.startsWith('data:')
        ? file.base64Data
        : `data:${file.mimeType};base64,${file.base64Data}`,
    });
  }

  websearch(
    chatId: string,
    query: string,
    site?: string,
    language?: string,
    maxResults?: number
  ): Promise<WebSearchResult[]> {
    return Promise.resolve([]);
  }
}
