import { sanitizeMessages } from "./messages";
import { createSseParser } from "./sse-parser";

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
      const data = await response.json();
      const title = data.text || data.choices?.[0]?.message?.content || "";
      if (title) {
        return title.trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch (_e) {}
  // Fallback: use a truncated version of the user's message
  return `${message.slice(0, 30)}...`;
};

function buildRequestBody({
  model,
  messages,
  apiKey,
  thinking,
  artifacts,
  maxTokens,
  agentMode,
  conversationId,
  e2bApiKey,
  sandboxId,
  tools,
  toolChoice,
}) {
  const body = {
    model,
    messages,
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

  return body;
}

async function postChat(body, model, stream) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream }),
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

  return response;
}

/**
 * Turns decoded SSE frames into callback calls and remembers what the stream
 * actually delivered. That record is the retry decision: a clean EOF with
 * nothing in it means the response was dropped upstream before its first
 * delta, and tool results count as delivered because their work already
 * happened server-side and must never be re-run.
 */
function createFrameRouter({
  model,
  onChunk,
  onError,
  onToolCall,
  onSearchResult,
  onMetrics,
  onSandboxResult,
}) {
  const delivered = {
    content: false,
    thinking: false,
    toolCall: false,
    serverEvent: false,
    serverError: false,
  };

  const route = (event) => {
    if (event.type === "usage") {
      onMetrics?.(event.usage);
      return;
    }

    if (event.type === "error") {
      delivered.serverError = true;
      onError(
        new Error(
          event.error || `Server error during streaming with model "${model}"`,
        ),
      );
      return;
    }

    if (event.type === "search_result") {
      if (!onSearchResult) return;
      delivered.serverEvent = true;
      onSearchResult(event.sources || [], event.content || "");
      return;
    }

    if (event.type === "sandbox_result") {
      if (!onSandboxResult) return;
      delivered.serverEvent = true;
      onSandboxResult(event);
      return;
    }

    const delta = event.choices?.[0]?.delta || {};

    if (delta.content) {
      delivered.content = true;
      onChunk(delta.content, "content");
    }
    if (delta.thinking) {
      delivered.thinking = true;
      onChunk(delta.thinking, "thinking");
    }
    if (delta.tool_calls && onToolCall) {
      delivered.toolCall = true;
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
  };

  const anyDelivered = () =>
    delivered.content ||
    delivered.thinking ||
    delivered.toolCall ||
    delivered.serverEvent ||
    delivered.serverError;

  return { route, anyDelivered };
}

/**
 * Read the SSE body to its end, reporting whether the stream turned out to be
 * empty. A partial frame left in the buffer at EOF cannot be salvaged, so it is
 * dispatched as-is and ignored if it does not parse — we complete the message
 * with what we have rather than hanging.
 */
async function streamOnce(body, router, model, onComplete) {
  const response = await postChat(body, model, true);

  const parser = createSseParser(router.route);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      parser.write(decoder.decode());
      parser.end();
      break;
    }
    parser.write(decoder.decode(value, { stream: true }));
  }

  if (!router.anyDelivered()) return true;

  await onComplete?.();
  return false;
}

async function replayOnce(body, model, handlers) {
  const { onChunk, onError, onComplete, onSandboxResult, onFallbackStart } =
    handlers;
  try {
    // The non-streaming retry regenerates the whole answer, so callers must
    // discard whatever the dead stream already accumulated — otherwise the
    // replay appends to it and the response appears twice.
    onFallbackStart?.();
    const response = await postChat(body, model, false);
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
}

/**
 * Stream a chat completion from /api/chat.
 *
 * Takes a single options object so call sites stay readable as new parameters
 * are added. Frames are split on blank-line SSE boundaries, so a partial frame
 * (bytes cut mid-JSON by a dropped connection) waits in the buffer for more
 * data instead of being silently dropped.
 *
 * If the SSE transport fails (e.g. the proxy's QUIC error), or the stream ends
 * cleanly but delivered nothing at all, the request is retried **once** with
 * `stream: false` and the JSON result is replayed through the same callbacks.
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

  // Drop records that would break a request (e.g. assistant error
  // placeholders saved into history). These stay visible in the UI but must
  // never be replayed to the model.
  const body = buildRequestBody({
    model,
    messages: sanitizeMessages(messages),
    apiKey,
    thinking,
    artifacts,
    maxTokens,
    agentMode,
    conversationId,
    e2bApiKey,
    sandboxId,
    tools,
    toolChoice,
  });

  const router = createFrameRouter({
    model,
    onChunk,
    onError,
    onToolCall,
    onSearchResult,
    onMetrics,
    onSandboxResult,
  });

  let needsReplay = false;
  try {
    needsReplay = await streamOnce(body, router, model, onComplete);
  } catch (error) {
    console.warn(
      "[stream] Streaming failed, falling back to non-streaming:",
      error.message,
    );
    needsReplay = true;
  }

  // Exactly one replay, whichever path asked for it.
  if (needsReplay) {
    await replayOnce(body, model, {
      onChunk,
      onError,
      onComplete,
      onSandboxResult,
      onFallbackStart,
    });
  }
};
