/**
 * src/lib/tools.js - Tool registry for AI assistant
 *
 * This file defines ALL available tools for the AI assistant.
 * Each tool is registered with:
 * 1. input schema (JSON Schema object)
 * 2. execution function
 * 3. output format (standard tool calling convention)
 */

import { getStoredApiKey } from "./api-client";

/**
 * Tool definitions following standard tool calling format
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
  {
    type: "function",
    function: {
      name: "javascript_calculator",
      description:
        "Evaluate a mathematical expression using JavaScript-style arithmetic. Supports +, -, *, /, %, ^, parentheses, decimals, and unary minus.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description:
              "A mathematical expression to evaluate, e.g. '(12.5 * (3 + 4)) / 2'.",
          },
        },
        required: ["expression"],
      },
    },
  },
];

function tokenizeExpression(expression) {
  const tokens = [];
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let num = char;
      i += 1;

      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        num += expression[i];
        i += 1;
      }

      if ((num.match(/\./g) || []).length > 1) {
        throw new Error(`Invalid number: ${num}`);
      }

      const value = Number(num);
      if (Number.isNaN(value)) {
        throw new Error(`Invalid number: ${num}`);
      }

      tokens.push({ type: "number", value });
      continue;
    }

    if ("+-*/%^()".includes(char)) {
      if (char === "(") {
        tokens.push({ type: "leftParen" });
      } else if (char === ")") {
        tokens.push({ type: "rightParen" });
      } else {
        tokens.push({ type: "operator", value: char });
      }
      i += 1;
      continue;
    }

    throw new Error(`Invalid character: ${char}`);
  }

  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const operators = [];
  const precedence = {
    "u-": 4,
    "^": 3,
    "*": 2,
    "/": 2,
    "%": 2,
    "+": 1,
    "-": 1,
  };
  const rightAssociative = new Set(["^", "u-"]);

  let prevType = "start";

  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token);
      prevType = "number";
      continue;
    }

    if (token.type === "leftParen") {
      operators.push(token);
      prevType = "leftParen";
      continue;
    }

    if (token.type === "rightParen") {
      while (
        operators.length > 0 &&
        operators[operators.length - 1].type !== "leftParen"
      ) {
        output.push(operators.pop());
      }

      if (operators.length === 0) {
        throw new Error("Mismatched parentheses");
      }

      operators.pop();
      prevType = "rightParen";
      continue;
    }

    if (token.type === "operator") {
      let operator = token.value;
      const isUnaryMinus =
        operator === "-" &&
        (prevType === "start" ||
          prevType === "operator" ||
          prevType === "leftParen");
      if (isUnaryMinus) {
        operator = "u-";
      } else if (
        prevType === "start" ||
        prevType === "operator" ||
        prevType === "leftParen"
      ) {
        throw new Error("Invalid operator placement");
      }

      while (operators.length > 0) {
        const top = operators[operators.length - 1];
        if (top.type !== "operator") break;

        const topPrecedence = precedence[top.value];
        const currentPrecedence = precedence[operator];
        const shouldPop = rightAssociative.has(operator)
          ? currentPrecedence < topPrecedence
          : currentPrecedence <= topPrecedence;

        if (!shouldPop) break;
        output.push(operators.pop());
      }

      operators.push({ type: "operator", value: operator });
      prevType = "operator";
    }
  }

  while (operators.length > 0) {
    const op = operators.pop();
    if (op.type === "leftParen" || op.type === "rightParen") {
      throw new Error("Mismatched parentheses");
    }
    output.push(op);
  }

  return output;
}

function evaluateRpn(rpn) {
  const stack = [];

  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }

    if (token.type !== "operator") {
      throw new Error("Invalid token in expression");
    }

    if (token.value === "u-") {
      if (stack.length < 1) {
        throw new Error("Malformed expression");
      }
      stack.push(-stack.pop());
      continue;
    }

    if (stack.length < 2) {
      throw new Error("Malformed expression");
    }

    const right = stack.pop();
    const left = stack.pop();
    let value;

    switch (token.value) {
      case "+":
        value = left + right;
        break;
      case "-":
        value = left - right;
        break;
      case "*":
        value = left * right;
        break;
      case "/":
        if (right === 0) throw new Error("Division by zero");
        value = left / right;
        break;
      case "%":
        if (right === 0) throw new Error("Division by zero");
        value = left % right;
        break;
      case "^":
        value = left ** right;
        break;
      default:
        throw new Error(`Unsupported operator: ${token.value}`);
    }

    if (!Number.isFinite(value)) {
      throw new Error("Result is not finite");
    }

    stack.push(value);
  }

  if (stack.length !== 1) {
    throw new Error("Malformed expression");
  }

  return stack[0];
}

function evaluateMathExpression(expression) {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error("Expression is required");
  }

  const tokens = tokenizeExpression(trimmed);
  const rpn = toRpn(tokens);
  return evaluateRpn(rpn);
}

/**
 * Execute a web search using the /api/exa endpoint
 * @param {string} query - The search query to find information about
 * @param {number} numResults - Number of results to return (default: 5)
 * @returns {Promise<object>} Search results with answer and citations
 */
export async function executeWebSearch(query, numResults = 5, apiKey = null) {
  // Use provided API key or fall back to stored key
  const key = apiKey || getStoredApiKey();
  if (!key) {
    throw new Error("API key not found. Please set your API key in settings.");
  }

  // Validate query
  if (!query || typeof query !== "string") {
    throw new Error("Invalid search query");
  }

  try {
    const sanitizedNumResults = Math.max(1, Math.min(numResults || 5, 10));

    const response = await fetch(
      "https://ai.hackclub.com/proxy/v1/exa/answer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          query,
          numResults: sanitizedNumResults,
          useAutoprompt: true,
        }),
      },
    );

    if (!response.ok) {
      // Handle non-JSON error responses gracefully
      const contentType = response.headers.get("content-type");
      let errorMessage = `Exa API error: ${response.status}`;
      try {
        if (contentType?.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await response.text();
          if (text) errorMessage = text;
        }
      } catch (_e) {
        // Keep default error message
      }
      throw new Error(errorMessage);
    }

    // Validate content type
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      throw new Error(`Invalid response type from Exa: ${contentType}`);
    }

    const text = await response.text();
    if (!text.trim()) {
      throw new Error("Empty response from Exa API");
    }

    const result = JSON.parse(text);

    return {
      query,
      numResults: sanitizedNumResults,
      answer: result.answer || result.content || "",
      citations: result.citations || result.sources || [],
      success: true,
    };
  } catch (error) {
    console.error("Error executing web_search:", error);
    throw new Error(`Web search failed: ${error.message}`);
  }
}

export function executeJavascriptCalculator(expression) {
  if (typeof expression !== "string") {
    throw new Error("Expression must be a string");
  }

  const result = evaluateMathExpression(expression);

  return {
    expression,
    result,
    success: true,
  };
}

/**
 * Execute a specific tool by name
 * @param {string} toolName - Name of the tool to execute
 * @param {object} params - Parameters passed to the tool
 * @returns {Promise<object>} Execution result or error object
 */
export async function executeTool(toolName, params, apiKey = null) {
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
        return await executeWebSearch(params.query, params.numResults, apiKey);

      case "javascript_calculator":
        return executeJavascriptCalculator(params.expression);

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
 * @returns {Array} Array of tool objects ready for tool calling
 */
export function getTools(options = {}) {
  const { includeWebSearch = true } = options;

  return TOOLS.filter((tool) => {
    if (!includeWebSearch && tool.function.name === "web_search") {
      return false;
    }

    return true;
  });
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
