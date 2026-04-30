export interface TavilySearchOptions {
  query: string;
  numResults?: number;
  searchDepth?: "basic" | "advanced";
  topic?: "general" | "news" | "finance";
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilySearchResult[];
  answer?: string;
}

/**
 * Service for performing web searches using the Tavily Search API
 * Returns formatted content optimized for LLM consumption
 */
export class TavilySearchService {
  private static readonly BASE_API_URL = "https://api.tavily.com/search";
  private static readonly TIMEOUT_MS = 25000;

  /**
   * Performs a web search and returns formatted content from Tavily
   * @param options Search options
   * @param apiKey Tavily API key for authentication
   * @returns Formatted text content for LLM consumption
   */
  static async search(
    options: TavilySearchOptions,
    apiKey: string
  ): Promise<string> {
    const {
      query,
      numResults = 8,
      searchDepth = "basic",
      topic = "general"
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(this.BASE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: numResults,
          search_depth: searchDepth,
          topic,
          include_answer: false,
          include_raw_content: false,
          include_images: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Tavily search failed: ${response.status} ${response.statusText}`
        );
      }

      const data: TavilyResponse = await response.json();

      if (!data.results || data.results.length === 0) {
        return "No search results found. Please try a different query.";
      }

      // Format results for LLM consumption
      const formattedResults = data.results
        .map(
          (result, index) =>
            `[${index + 1}] ${result.title}\nURL: ${result.url}\n${result.content}`
        )
        .join("\n\n");

      return formattedResults;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Tavily search timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
