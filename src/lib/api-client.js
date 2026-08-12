const API_KEY_STORAGE_KEY = "hack_club_ai_key";
const E2B_API_KEY_STORAGE_KEY = "e2b_api_key";

// Helper function to extract error message from API response
export const getErrorMessage = (errorData, defaultMessage) => {
  if (!errorData) return defaultMessage;
  if (errorData.error) {
    if (typeof errorData.error === "object" && errorData.error.message) {
      return errorData.error.message;
    }
    if (typeof errorData.error === "string") {
      return errorData.error;
    }
  }
  if (errorData.message) {
    return errorData.message;
  }
  return defaultMessage;
};

export const getStoredApiKey = () => {
  if (typeof window === "undefined") return null;
  const key = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (!key) return null;
  if (key.startsWith("{") || key.startsWith("[")) {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    return null;
  }
  return key;
};

export const setStoredApiKey = (apiKey) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
};

export const getStoredE2bApiKey = () => {
  if (typeof window === "undefined") return null;
  const key = localStorage.getItem(E2B_API_KEY_STORAGE_KEY);
  if (!key) return null;
  if (key.startsWith("{") || key.startsWith("[")) {
    localStorage.removeItem(E2B_API_KEY_STORAGE_KEY);
    return null;
  }
  return key;
};

export const setStoredE2bApiKey = (apiKey) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(E2B_API_KEY_STORAGE_KEY, apiKey);
};

export const streamChatCompletion = async (
  messages,
  model = "gpt-4o-mini",
  onChunk,
  onError,
  onComplete,
  includeThinking = false,
  artifactsEnabled = false,
  tools = null,
  toolChoice = "auto",
  onToolCall = null,
  onSearchResult = null,
  onMetrics = null,
  maxTokens = null,
  agentMode = false,
  conversationId = null,
  e2bApiKey = null,
  sandboxId = null,
  onSandboxResult = null,
) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    onError(
      new Error(
        "API key not found. Please set your Hack Club API key in Settings to start chatting.",
      ),
    );
    return;
  }

  const body = { model, messages, apiKey, think: !!includeThinking };
  body.artifacts = artifactsEnabled;
  if (maxTokens) body.max_tokens = maxTokens;
  if (agentMode) {
    body.agentMode = true;
    if (conversationId) body.conversationId = conversationId;
    if (e2bApiKey) body.e2bApiKey = e2bApiKey;
    if (sandboxId) body.sandboxId = sandboxId;
  }

  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const doStream = async () => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, stream: true }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          getErrorMessage(
            errorData,
            `Chat API Error (${response.status}) using model "${model}"`,
          ),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (line) => {
        if (!line.startsWith("data: ")) return;

        const data = line.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);

          // Usage metrics from server
          if (parsed.type === "usage" && onMetrics) {
            onMetrics(parsed.usage);
            return;
          }

          // Error event from server
          if (parsed.type === "error") {
            onError(
              new Error(
                parsed.error ||
                  `Server error during streaming with model "${model}"`,
              ),
            );
            return;
          }

          // Search result metadata from server-side tool execution
          if (parsed.type === "search_result" && onSearchResult) {
            onSearchResult(parsed.sources || [], parsed.content || "");
            return;
          }

          // Sandbox execution result
          if (parsed.type === "sandbox_result" && onSandboxResult) {
            onSandboxResult(parsed);
            return;
          }

          const delta = parsed.choices?.[0]?.delta || {};
          const content = delta.content || "";
          const thinking = delta.thinking || "";

          if (content) onChunk(content, "content");
          if (thinking) onChunk(thinking, "thinking");

          if (delta.tool_calls && onToolCall) {
            for (const toolCall of delta.tool_calls) {
              onToolCall({
                index: toolCall.index,
                id: toolCall.id,
                name: toolCall.function?.name || "",
                arguments: toolCall.function?.arguments || "",
                complete: !!toolCall.id,
              });
            }
          }
        } catch (_error) {
          // Ignore malformed or partial lines until more stream data arrives.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode(undefined);
          const remaining = buffer.trim();
          if (remaining) processLine(remaining);
          await onComplete?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processLine(line.trim());
        }
      }
    } catch (error) {
      // If streaming fails (e.g. QUIC protocol error), fall back to non-streaming
      console.warn(
        "[stream] Streaming failed, falling back to non-streaming:",
        error.message,
      );
      await doFallback();
    }
  };

  const doFallback = async () => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, stream: false }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          getErrorMessage(
            errorData,
            `Chat API Error (${response.status}) using model "${model}"`,
          ),
        );
      }

      const data = await response.json();
      if (data.text) {
        onChunk(data.text, "content");
      }
      if (Array.isArray(data.sandboxResults) && onSandboxResult) {
        for (const sandboxResult of data.sandboxResults) {
          onSandboxResult(sandboxResult);
        }
      }
      await onComplete?.();
    } catch (error) {
      onError(error);
    }
  };

  return doStream();
};

export const generateTitle = async (
  message,
  model = "qwen/qwen3-next-80b-a3b-instruct",
) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) return "New Chat";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates extremely short titles (max 4 words) for chat conversations based on the first message. Return ONLY the title.",
          },
          { role: "user", content: message },
        ],
        apiKey,
        stream: false,
      }),
    });

    if (response.ok) {
      // Since we set stream: false, the API now returns JSON
      const data = await response.json();
      // Extract the title from the response
      const title = data.text || data.choices?.[0]?.message?.content || "";
      if (title) {
        return title.trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch (_e) {}
  // Fallback: use a truncated version of the user's message
  return `${message.slice(0, 30)}...`;
};

// Exa API functions
export const exaSearch = async (query, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not found. Please set your Hack Club API key in Settings to search the web.",
    );
  }

  const body = {
    endpoint: "search",
    apiKey,
    data: {
      query,
      numResults: options.numResults || 10,
      ...options,
    },
  };

  const response = await fetch("/api/exa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      getErrorMessage(
        errorData,
        `Exa search failed (${response.status}) for query: "${query.slice(0, 100)}"`,
      ),
    );
  }

  return response.json();
};

export const exaFindSimilar = async (url, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not found. Please set your Hack Club API key in Settings to find similar pages.",
    );
  }

  const body = {
    endpoint: "findSimilar",
    apiKey,
    data: {
      url,
      numResults: options.numResults || 10,
      ...options,
    },
  };

  const response = await fetch("/api/exa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      getErrorMessage(
        errorData,
        `Exa findSimilar failed (${response.status}) for URL: "${url.slice(0, 100)}"`,
      ),
    );
  }

  return response.json();
};

export const exaContents = async (urls, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not found. Please set your Hack Club API key in Settings to retrieve page contents.",
    );
  }

  const body = {
    endpoint: "contents",
    apiKey,
    data: {
      urls: Array.isArray(urls) ? urls : [urls],
      ...options,
    },
  };

  const response = await fetch("/api/exa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      getErrorMessage(
        errorData,
        `Exa contents failed (${response.status}) for ${urls.length} URL(s)`,
      ),
    );
  }

  return response.json();
};

export const exaAnswer = async (query, options = {}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error(
      "API key not found. Please set your Hack Club API key in Settings to search the web.",
    );
  }

  const body = {
    endpoint: "answer",
    apiKey,
    data: {
      query,
      ...options,
    },
    stream: options.stream || false,
  };

  const response = await fetch("/api/exa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      getErrorMessage(
        errorData,
        `Exa answer failed (${response.status}) for query: "${query.slice(0, 100)}"`,
      ),
    );
  }

  return response;
};

/**
 * Stream chat completion with optional tool support
 * This unified function handles both regular chat and tool calling
 */
export const streamChatWithTools = async (
  messages,
  model = "gpt-4o-mini",
  onChunk,
  onError,
  onComplete,
  includeThinking = false,
  artifactsEnabled = false,
  tools = null, // Array of tool definitions for function calling
  toolChoice = "auto",
  onToolCall = null, // Callback when model decides to call a tool
) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    onError(
      new Error(
        "API key not found. Please set your Hack Club API key in Settings to chat with tools.",
      ),
    );
    return;
  }

  try {
    const body = {
      model,
      messages,
      apiKey,
      stream: true,
      think: !!includeThinking,
    };

    // Add artifacts parameter if enabled
    if (artifactsEnabled) {
      body.artifacts = true;
    }

    // Add tool calling parameters if tools provided
    if (tools && Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = toolChoice;
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        getErrorMessage(
          errorData,
          `Chat API Error (${response.status}) using model "${model}"`,
        ),
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const type = trimmedLine[0];
        const jsonString = trimmedLine.slice(2);

        try {
          const data = JSON.parse(jsonString);
          if (type === "0") {
            onChunk(data, "content");
          } else if (type === "6") {
            onChunk(data, "thinking");
          } else if (type === "8") {
            if (onToolCall) {
              onToolCall({
                index: data.toolCall.index,
                id: data.toolCall.toolCallId,
                name: data.toolCall.toolName,
                arguments: data.toolCall.args,
                complete: false,
              });
            }
          } else if (type === "9") {
            if (onToolCall) {
              onToolCall({
                index: data.toolCall.index,
                id: data.toolCall.toolCallId,
                name: "",
                arguments: "",
                complete: true,
              });
            }
          }
        } catch (e) {
          console.error("Error parsing stream line:", trimmedLine, e);
        }
      }
    }
    onComplete?.();
  } catch (error) {
    onError(error);
  }
};

export const streamExaAnswer = async (
  query,
  onChunk,
  onError,
  onComplete,
  options = {},
) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    onError(
      new Error(
        "API key not found. Please set your Hack Club API key in Settings for web search.",
      ),
    );
    return;
  }

  try {
    const body = {
      endpoint: "answer",
      apiKey,
      data: {
        query,
        ...options,
        stream: true,
      },
      stream: true,
    };

    const response = await fetch("/api/exa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        getErrorMessage(
          errorData,
          `Exa stream error (${response.status}) for query: "${query.slice(0, 100)}"`,
        ),
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode(undefined);
        // Process any remaining complete events before finishing
        const remaining = buffer.trim();
        if (remaining) {
          const lines = remaining.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content =
                  parsed.answer ||
                  parsed.content ||
                  parsed.choices?.[0]?.delta?.content ||
                  "";
                if (content) onChunk(content);
              } catch (_e) {}
            }
          }
        }
        onComplete?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const content =
                parsed.answer ||
                parsed.content ||
                parsed.choices?.[0]?.delta?.content ||
                "";
              if (content) onChunk(content);
            } catch (_e) {}
          }
        }
      }
    }
  } catch (error) {
    onError(error);
  }
};

/**
 * Execute a tool call from the AI assistant
 * @param {string} toolName - Name of the tool to execute
 * @param {object} parameters - Tool parameters
 * @returns {Promise<object>} Tool execution result
 */
export const executeToolCall = async (toolName, parameters, apiKey = null) => {
  // Use provided API key or fall back to stored key
  const key = apiKey || getStoredApiKey();
  if (!key) {
    throw new Error(
      `API key not found. Please set your Hack Club API key in Settings to execute tool "${toolName}".`,
    );
  }

  // For now, we proxy tool calls through /api/tools endpoint
  // which uses the centralized tool execution system
  const response = await fetch("/api/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: toolName,
      parameters,
      apiKey: key, // Pass API key to server
    }),
  });

  if (!response.ok) {
    // Try to parse error JSON, but handle non-JSON responses gracefully
    const contentType = response.headers.get("content-type");
    let errorMessage = `Tool execution failed (${response.status}) for tool "${toolName}"`;
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

  // Check if response is JSON before parsing
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new Error(
      `Invalid response type "${contentType}" from tool "${toolName}"`,
    );
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Empty response from tool "${toolName}" execution`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Failed to parse tool response for "${toolName}": ${e.message}`,
    );
  }
};
