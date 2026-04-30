import { tavily } from "@tavily/core";

export interface TavilySearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  topic?: "general" | "news" | "finance";
}

/**
 * Service for performing web searches using Tavily API
 * Returns raw formatted content optimized for LLM consumption
 */
export class TavilySearchService {
  /**
   * Performs a web search and returns formatted content from Tavily
   * @param options Search options
   * @param apiKey Tavily API key for authentication
   * @returns Raw text content formatted for LLM consumption
   */
  static async search(
    options: TavilySearchOptions,
    apiKey: string
  ): Promise<string> {
    const {
      query,
      maxResults = 8,
      searchDepth = "advanced",
      topic = "general"
    } = options;

    const client = tavily({ apiKey });

    const response = await client.search(query, {
      maxResults,
      searchDepth,
      topic
    });

    if (!response.results || response.results.length === 0) {
      return "No search results found. Please try a different query.";
    }

    return response.results
      .map(
        (result: { title: string; url: string; content: string }) =>
          `Title: ${result.title}\nURL: ${result.url}\nContent: ${result.content}`
      )
      .join("\n\n---\n\n");
  }
}
