/**
 * Exa API Client
 *
 * This client provides functions to interact with Exa's API through
 * the Hack Club AI proxy. Exa allows you to search the web, find similar
 * pages, extract content from URLs, and answer questions with live web context.
 */

import {
  exaAnswer,
  exaContents,
  exaFindSimilar,
  exaSearch,
  streamExaAnswer,
} from "./api-client";

export { exaAnswer, exaContents, exaFindSimilar, exaSearch, streamExaAnswer };

/**
 * Example: Add web search capability to a chat message
 *
 * This shows how you could integrate Exa search into your chat interface:
 *
 * ```javascript
 * // In your chat component, when a user asks a question that needs web search:
 * const handleSendMessage = async (content) => {
 *   // Check if the message needs web search
 *   const needsWebSearch = content.toLowerCase().includes('search') ||
 *                          content.toLowerCase().includes('web') ||
 *                          content.toLowerCase().includes('news') ||
 *                          content.toLowerCase().includes('current');
 *
 *   if (needsWebSearch) {
 *     // Use Exa to search and get an answer with web context
 *     const response = await exaAnswer(content, {
 *       numResults: 5,
 *       useAutoprompt: true
 *     });
 *
 *     // Process the response
 *     const answer = response.answer;
 *     const citations = response.citations || [];
 *
 *     // Display the answer with citations
 *     addMessage({
 *       role: 'assistant',
 *       content: answer,
 *       citations: citations
 *     });
 *   } else {
 *     // Use regular chat completion
 *     // ... existing chat logic
 *   }
 * };
 * ```
 */

/**
 * Example: Web search tool for function calling
 *
 * You can use this as a tool for function calling in your chat system:
 */
export const exaSearchTool = {
  type: "function",
  function: {
    name: "exa_search",
    description: "Search the web for information using Exa API",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        numResults: {
          type: "number",
          description: "Number of results to return",
          default: 5,
        },
      },
      required: ["query"],
    },
  },
};

/**
 * Example: Find similar pages tool for function calling
 */
export const exaFindSimilarTool = {
  type: "function",
  function: {
    name: "exa_find_similar",
    description: "Find pages similar to a given URL",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to find similar pages for",
        },
        numResults: {
          type: "number",
          description: "Number of similar results to return",
          default: 5,
        },
      },
      required: ["url"],
    },
  },
};

/**
 * Example: Extract content from URLs tool for function calling
 */
export const exaContentsTool = {
  type: "function",
  function: {
    name: "exa_contents",
    description: "Extract content from URLs",
    parameters: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "Array of URLs to extract content from",
        },
      },
      required: ["urls"],
    },
  },
};

/**
 * Example: Answer with web context tool for function calling
 */
export const exaAnswerTool = {
  type: "function",
  function: {
    name: "exa_answer",
    description: "Get an answer to a question using web search results",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The question to answer",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * Example implementation of a chat system with web search capability
 */
export class ExaChatSystem {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async sendMessage(content, options = {}) {
    // First, try to answer using Exa's answer endpoint
    try {
      const response = await exaAnswer(content, {
        stream: options.stream || false,
        ...options,
      });

      if (options.stream) {
        // Handle streaming response
        let fullContent = "";
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.answer || parsed.content || "";
                if (content) {
                  fullContent += content;
                  options.onChunk?.(content);
                }
              } catch (_e) {}
            }
          }
        }

        options.onComplete?.(fullContent);
        return { content: fullContent };
      } else {
        // Non-streaming response
        const result = await response.json();
        return {
          content: result.answer || "",
          citations: result.citations || [],
          sources: result.sources || [],
        };
      }
    } catch (error) {
      console.error("Exa API error:", error);
      throw error;
    }
  }
}
