export interface ExaSearchOptions {
  query: string;
  numResults?: number;
  livecrawl?: "fallback" | "preferred";
  type?: "auto" | "fast" | "deep";
  contextMaxCharacters?: number;
}

interface ExaResponse {
  jsonrpc: string;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Service for performing web searches using Exa AI MCP API
 * Returns raw formatted content optimized for LLM consumption
 */
export class ExaSearchService {
  private static readonly BASE_API_URL = "https://mcp.exa.ai/mcp";
  private static readonly TIMEOUT_MS = 25000;

  /**
   * Performs a web search and returns raw content from Exa AI
   * @param options Search options
   * @param apiKey Optional Exa API key for authentication
   * @returns Raw text content formatted by Exa AI for LLM consumption
   */
  static async search(
    options: ExaSearchOptions,
    apiKey?: string
  ): Promise<string> {
    const {
      query,
      numResults = 8,
      livecrawl = "fallback",
      type = "auto",
      contextMaxCharacters = 10000
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const apiUrl = apiKey
        ? `${this.BASE_API_URL}?exaApiKey=${apiKey}`
        : this.BASE_API_URL;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "web_search_exa",
            arguments: {
              query,
              type,
              numResults,
              livecrawl,
              contextMaxCharacters
            }
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Exa search failed: ${response.status} ${response.statusText}`
        );
      }

      const responseText = await response.text();

      // Parse SSE response
      const lines = responseText.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.substring(6); // Remove "data: " prefix
          try {
            const data: ExaResponse = JSON.parse(jsonStr);

            if (data.error) {
              throw new Error(`Exa API error: ${data.error.message}`);
            }

            if (data.result?.content && data.result.content.length > 0) {
              // Return raw content from Exa - already formatted for LLM
              return data.result.content[0].text;
            }
          } catch (e) {
            // Continue to next line if JSON parsing fails
            continue;
          }
        }
      }

      // No results found
      return "No search results found. Please try a different query.";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Exa search timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
