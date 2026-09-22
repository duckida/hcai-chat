import { sanitizeMessages } from "./messages";

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

/**
 * Stream a chat completion from /api/chat.
 *
 * Takes a single options object so call sites stay readable as new
 * parameters are added. Frames are split on blank-line SSE boundaries:
 * a partial frame (bytes cut mid-JSON by a dropped connection) stays in
 * the buffer until more data arrives rather than being silently dropped.
 *
 * If the SSE transport fails (e.g. the proxy's QUIC error), the request
 * is retried once with `stream: false` and the JSON result is replayed
 * through the same callbacks. The retry regenerates the whole answer, so
 * onFallbackStart fires first and any partially-streamed content must be
 * discarded — otherwise the replayed text is appended to the partial text
 * and the answer appears twice in one message.
 *
 * @param {object} options
 */
export const streamChatCompletion = async ({
  messages,
  model = "xiaomi/mimo-v2.5",
  onChunk,
  onError,
  onComplete,
  thinking = false,
  artifacts = false,
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
  onFallbackStart = null,
}) => {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    onError(
      new Error(
        "API key not found. Please set your Hack Club API key in Settings to start chatting.",
      ),
    );
    return;
  }

  // Drop any records that would break a request (e.g. assistant error
  // placeholders saved into history). These stay visible in the UI but must
  // never be replayed to the model.
  const cleanMessages = sanitizeMessages(messages);

  const body = {
    model,
    messages: cleanMessages,
    apiKey,
    think: !!thinking,
    artifacts,
  };
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

      const dispatchFrame = (raw) => {
        const trimmed = raw.trim();
        if (!trimmed.startsWith("data: ")) return;
        const data = trimmed.slice(6);
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
          // Ignore malformed or partial frames until more stream data arrives.
        }
      };

      // Split on blank-line event boundaries. A frame is only complete once we
      // hit "\n\n" (or "\r\n\r\n"), so trailing partial data stays in the
      // buffer until the next read — nothing is silently dropped on EOF.
      const flushFrames = () => {
        let frameStart = 0;
        let idx = 0;
        while (idx < buffer.length) {
          if (buffer[idx] === "\n" && buffer[idx + 1] === "\n") {
            const raw = buffer.slice(frameStart, idx);
            frameStart = idx + 2;
            dispatchFrame(raw.trim());
            idx += 2;
            continue;
          }
          if (buffer[idx] === "\r") {
            idx++;
            continue;
          }
          idx++;
        }
        buffer = buffer.slice(frameStart);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode(undefined);
          // Process any final complete frame that arrived without a trailing
          // blank line. A genuinely partial frame (mid-JSON cut by a dropped
          // connection) cannot be salvaged — skip it so we still complete the
          // message with what we have rather than hanging.
          if (buffer) dispatchFrame(buffer.trim());
          await onComplete?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        flushFrames();
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
      onFallbackStart?.();
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
