import { JSONSchema7 } from "json-schema";
import global from "../../config/global";
import { ChatContext } from "../chat-context";
import { DialogueParams, DialogueTool, ToolResult } from "../../types";

export const TOOL_NAME = "webSearch";

export default class WebSearchTool implements DialogueTool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  private chatContext: ChatContext;
  private params: DialogueParams;

  constructor(chatContext: ChatContext, params: DialogueParams) {
    this.params = params;
    this.chatContext = chatContext;
    this.description = `Search the web using Exa AI - performs real-time web searches and can scrape content from specific URLs. Provides up-to-date information for current events and recent data. Supports configurable result counts and returns the content from the most relevant websites. Use this tool for accessing information beyond knowledge cutoff.`;
    this.parameters = {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query to execute. Use specific keywords and phrases for better results."
        },
        numResults: {
          type: "integer",
          description: "Number of search results to return (default: 8)",
          default: 8,
          minimum: 1,
          maximum: 50
        },
        livecrawl: {
          type: "string",
          enum: ["fallback", "preferred"],
          description:
            "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
          default: "fallback"
        },
        type: {
          type: "string",
          enum: ["auto", "fast", "deep"],
          description:
            "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
          default: "auto"
        },
        contextMaxCharacters: {
          type: "integer",
          description:
            "Maximum characters for context string optimized for LLMs (default: 10000)",
          default: 10000
        }
      },
      required: ["query"]
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!global.chatService) {
      return {
        content: [
          {
            type: "text",
            text: "Error: not implemented"
          }
        ]
      };
    }
    const results = await global.chatService?.websearch?.(
      this.chatContext.getChatId(),
      {
        query: args.query as string,
        numResults: (args.numResults as number) || 8,
        livecrawl: (args.livecrawl as "fallback" | "preferred") || "fallback",
        type: (args.type as "auto" | "fast" | "deep") || "auto",
        contextMaxCharacters: (args.contextMaxCharacters as number) || 10000
      }
    );

    if (!results || results.length === 0 || !results[0].content) {
      return {
        content: [
          {
            type: "text",
            text: "No search results found. Please try a different query."
          }
        ]
      };
    }

    return Promise.resolve({
      content: [
        {
          type: "text",
          text: results[0].content
        }
      ]
    });
  }
}

export { WebSearchTool };
