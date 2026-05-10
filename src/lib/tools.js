/**
 * src/lib/tools.js - Tool registry for AI assistant
 *
 * This file defines ALL available tools for the AI assistant.
 * Each tool is registered with:
 * 1. input schema (JSON Schema object)
 * 2. execution function
 * 3. output format (OpenAI function calling convention)
 */

import { getStoredApiKey } from "./api-client";

/**
 * Tool definitions following OpenAI function calling format
 */
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information, news, facts, or real-time data. Use this when the user asks about current events, specific information that might be outdated, or when you need to verify facts. The tool will return both the answer and source citations.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query to find information about. Should be a clear, concise question or topic. For best results, make it specific and natural language (e.g., 'What are the latest developments in quantum computing?' instead of 'quantum computing news')",
          },
          numResults: {
            type: "number",
            description:
              "Number of search results to consider (default: 5, max: 10). More results give broader context but take longer to process.",
            minimum: 1,
            maximum: 10,
            default: 5,
          },
        },
        required: ["query"],
      },
    },
  },
];

/**
 * Execute a web search using the /api/exa endpoint
 * @param {string} query - The search query to find information about
 * @param {number} numResults - Number of results to return (default: 5)
 * @returns {Promise<object>} Search results with answer and citations
 */
export async function executeWebSearch(query, numResults = 5) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("API key not found. Please set your API key in settings.");
  }

  try {
    const response = await fetch("/api/exa", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint: "answer",
        apiKey,
        data: {
          query,
          numResults: Math.min(numResults, 10),
          useAutoprompt: true,
        },
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Exa API error: ${response.status}`);
    }

    const result = await response.json();

    return {
      query,
      numResults,
      answer: result.answer || result.content || "",
      citations: result.citations || result.sources || [],
      success: true,
    };
  } catch (error) {
    console.error("Error executing web_search:", error);
    throw new Error(`Web search failed: ${error.message}`);
  }
}

/**
 * Execute a specific tool by name
 * @param {string} toolName - Name of the tool to execute
 * @param {object} params - Parameters passed to the tool
 * @returns {Promise<object>} Execution result or error object
 */
export async function executeTool(toolName, params) {
  // Validate tool exists
  const tool = TOOLS.find((t) => t.function.name === toolName);
  if (!tool) {
    throw new Error(
      `Unknown tool: ${toolName}. Available tools: ${TOOLS.map((t) => t.function.name).join(", ")}`,
    );
  }

  try {
    switch (toolName) {
      case "web_search":
        return await executeWebSearch(params.query, params.numResults);

      default:
        throw new Error(
          `Tool "${toolName}" is registered but has no executor. Please add execution logic.`,
        );
    }
  } catch (error) {
    console.error(`Error executing tool "${toolName}":`, error);
    throw error;
  }
}

/**
 * Get all available tools with their schemas
 * @returns {Array} Array of tool objects ready for OpenAI function calling
 */
export function getTools() {
  return TOOLS;
}

/**
 * Get tools with their execution functions
 * Useful for server-side tool calling
 * @returns {Array} Array of tool objects with schema and executor
 */
export function getToolExecutors() {
  return TOOLS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    execute: async (params) => executeTool(tool.function.name, params),
  }));
}
