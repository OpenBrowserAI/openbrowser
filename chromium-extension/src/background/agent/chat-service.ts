import { ChatService, uuidv4 } from "@openbrowser-ai/core";
import {
  OpenBrowserMessage,
  WebSearchResult
} from "@openbrowser-ai/core/types";
import { dbService } from "../../db/db-service";
import { bridgeFetchJson } from "../bridge-client";

type ContextPackResponse = {
  snippets?: Array<{ layer?: string; text?: string; score?: number }>;
  ssot_refs?: Array<{ path?: string; sha256?: string }>;
  provenance?: { retrieval_mode?: string };
};

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

  constructor() {}

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
    const getActiveTab = () =>
      new Promise<chrome.tabs.Tab | undefined>((resolve) =>
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
          resolve(tabs?.[0])
        )
      );

    const buildRecallText = (data: ContextPackResponse): string => {
      const snippets = Array.isArray(data?.snippets) ? data.snippets : [];
      const lines: string[] = [];

      lines.push("SOCA context-pack (local-only):");
      for (const s of snippets.slice(0, 10)) {
        const layer = typeof s.layer === "string" ? s.layer : "unknown";
        const text = typeof s.text === "string" ? s.text.trim() : "";
        if (!text) continue;
        lines.push(`--- [${layer}] ---`);
        lines.push(text);
      }

      const refs = Array.isArray(data?.ssot_refs) ? data.ssot_refs : [];
      if (refs.length) {
        lines.push("--- [ssot_refs] ---");
        for (const ref of refs.slice(0, 6)) {
          const path = typeof ref.path === "string" ? ref.path : "";
          const sha = typeof ref.sha256 === "string" ? ref.sha256 : "";
          if (!path) continue;
          lines.push(`${path}${sha ? `  sha256:${sha}` : ""}`);
        }
      }

      const joined = lines.join("\n").trim();
      return joined.length > 6000 ? joined.slice(0, 6000) : joined;
    };

    return (async () => {
      try {
        const tab = await getActiveTab();
        const data = await bridgeFetchJson<ContextPackResponse>(
          "/soca/context-pack",
          {
            method: "POST",
            body: JSON.stringify({
              query: prompt,
              page_text: "",
              tab_meta: {
                url: tab?.url,
                title: tab?.title,
                tabId: tab?.id
              },
              requested_layers: ["hot", "warm", "ltm"],
              ssot_scopes: ["SOCAcore"]
            }),
            withLane: true,
            timeoutMs: 20_000
          }
        );
        if (data?.provenance?.retrieval_mode !== "local-only") return "";
        return buildRecallText(data);
      } catch (error) {
        console.warn("SOCA memoryRecall failed:", error);
        return "";
      }
    })();
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

  // NOTE: websearch is intentionally disabled here to enforce "no direct internet egress".
  // If you need search, route it through bridge endpoints (policy + allowlist enforced server-side).
}
