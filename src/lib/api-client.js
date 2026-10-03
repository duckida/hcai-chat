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

async function postChat(body, model) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok) {
    // Error bodies are not guaranteed to be JSON. A proxy in front of the app
    // answers a dead upstream with plain text ("Bad Gateway") or an HTML error
    // page, and `response.json()` on that throws a SyntaxError whose message
    // replaces the real failure with `Unexpected token '<'...` noise. Read the
    // body as text and only treat it as JSON when it parses to an object.
    const rawBody = await response.text().catch(() => "");
    let errorData = null;
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object") {
        errorData = parsed;
      }
    } catch {
      // Plain-text proxy error — surfaced verbatim below.
    }

    const fallback = `Chat API Error (${response.status}) using model "${model}"`;
    if (errorData) {
      throw new Error(getErrorMessage(errorData, fallback));
    }
    // Prefer the body (HTTP/2 has no reason phrase, so statusText can be
    // empty); skip it when it is an HTML error page and fall back to statusText.
    const plain = rawBody.trim().replace(/\s+/g, " ");
    const detail =
      (plain && !plain.startsWith("<") ? plain.slice(0, 160) : "") ||
      response.statusText ||
      "";
    throw new Error(detail ? `${fallback} — ${detail}` : fallback);
  }

  return response;
}

/**
 * Turns decoded SSE frames into callback calls and remembers what the stream
 * actually delivered. That record is the retry decision: a clean EOF with
 * nothing in it means the response was dropped upstream before its first
 * delta, and tool results count as delivered because their work already
 * happened server-side and must never be re-run. `completed` records the
 * server's own end-of-stream marker, which is the only proof that what was
 * delivered is the whole answer.
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
    completed: false,
  };

  const route = (event) => {
    if (event.type === "sse_done") {
      delivered.completed = true;
      return;
    }

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

  return {
    route,
    anyDelivered,
    delivered,
    wasCompleted: () => delivered.completed,
  };
}

/**
 * How long the read loop tolerates a silent connection. The server writes a
 * keepalive comment every 5s, so 15s without a byte means the connection is
 * wedged (a throttled background tab, a dead proxy) — not that the model is
 * still thinking.
 */
const STALL_TIMEOUT_MS = 15_000;

/**
 * Read the SSE body to its end and decide what its ending means. A partial
 * frame left in the buffer at EOF cannot be salvaged, so it is dispatched as
 * is and ignored if it does not parse — we complete the message with what we
 * have rather than hanging.
 *
 * Completion is what the server *said*, not what the bytes did: the `[DONE]`
 * marker. Content that arrived without it is a connection that died
 * mid-answer, and is reported upward for replay instead of being committed
 * as a finished response.
 *
 * @returns {Promise<boolean>} true when this attempt must be treated as
 *   failed — the first attempt replays over it, the retry reports an error
 */
async function streamOnce(body, router, model, onComplete) {
  const response = await postChat(body, model);

  const parser = createSseParser(router.route);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // A pending read() never settles on its own on a wedged connection, and a
  // background tab may never be scheduled again — cancelling the reader turns
  // the stall into an EOF, which lands in the truncation check below. The
  // visibility check covers the return to a tab whose timer was throttled to
  // once a minute while the connection was already dead.
  let lastByteAt = Date.now();
  let stallTimer = null;
  const cancelRead = () => {
    reader.cancel().catch(() => {});
  };
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(cancelRead, STALL_TIMEOUT_MS);
  };
  const onVisibility = () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - lastByteAt >= STALL_TIMEOUT_MS
    ) {
      cancelRead();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  armStallTimer();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        parser.write(decoder.decode());
        parser.end();
        break;
      }
      lastByteAt = Date.now();
      armStallTimer();
      parser.write(decoder.decode(value, { stream: true }));
    }
  } finally {
    clearTimeout(stallTimer);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  // Order matters. Empty (with or without the marker) replays — an answer
  // that arrived as nothing is the oldest retry invariant here. An explicit
  // error frame or a delivered tool/search result never replays: their work
  // already happened, and re-running it would duplicate side effects the
  // client has already shown. Content without the marker is a truncation —
  // the connection ended before the server said it was done — and goes
  // through the same one-time replay as an empty stream.
  if (!router.anyDelivered()) return true;

  if (router.wasCompleted()) {
    await onComplete?.();
    return false;
  }

  if (router.delivered.serverEvent || router.delivered.serverError) {
    await onComplete?.();
    return false;
  }

  console.warn(
    "[stream] EOF without the [DONE] marker after delivered content — the response is truncated",
  );
  return true;
}

/**
 * The one retry, and the last one. It streams like the first attempt, with a
 * fresh frame router so this attempt's ending is judged on its own evidence —
 * the first attempt's delivered record would call any empty ending a
 * truncation. Streaming is load-bearing, not stylistic: a non-streaming retry
 * holds the connection with *zero bytes* for the whole regeneration, which is
 * exactly what a proxy read-timeout kills, so a long answer can finish at the
 * provider and still die on the way back (finding 16 — it did, billed at
 * 44k tokens / 8m28s, while the client saw a plain-text 502).
 */
async function replayOnce(body, model, handlers) {
  const {
    onChunk,
    onError,
    onToolCall,
    onSearchResult,
    onMetrics,
    onSandboxResult,
    onComplete,
    onFallbackStart,
  } = handlers;

  const retryRouter = createFrameRouter({
    model,
    onChunk,
    onError,
    onToolCall,
    onSearchResult,
    onMetrics,
    onSandboxResult,
  });

  try {
    // The retry regenerates the whole answer, so callers must discard
    // whatever the dead stream already accumulated — otherwise the retry
    // appends to it and the response appears twice. If no byte ever arrives,
    // the buffers keep their partial and the error below commits it.
    onFallbackStart?.();
    const needsAnother = await streamOnce(body, retryRouter, model, onComplete);
    if (needsAnother) {
      // No third attempt: bounded retries, or a flaky network turns into a
      // regeneration loop. The error commits whatever partial arrived.
      onError(
        new Error(
          retryRouter.anyDelivered()
            ? `Connection lost during the retry — the response for "${model}" was cut off before it finished.`
            : `No response received from model "${model}". The model may be overloaded or unavailable.`,
        ),
      );
    }
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
 * If the SSE transport fails (e.g. the proxy's QUIC error), the stream ends
 * cleanly but delivered nothing at all, or content arrived without the
 * server's `[DONE]` marker (a connection cut mid-answer), the request is
 * retried **once** with a fresh streamed request whose frames run through the
 * same callbacks. It streams for the reason the first attempt does: the
 * server's keepalives and the deltas keep bytes flowing, so a proxy cannot
 * idle-timeout a long regeneration the way the old silent non-streaming retry
 * could (finding 16). A delivered error frame or tool result is never
 * replayed over, and there is no third attempt.
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
      "[stream] Streaming failed, retrying with a fresh streamed request:",
      error.message,
    );
    needsReplay = true;
  }

  // Exactly one retry, whichever path asked for it.
  if (needsReplay) {
    await replayOnce(body, model, {
      onChunk,
      onError,
      onToolCall,
      onSearchResult,
      onMetrics,
      onComplete,
      onSandboxResult,
      onFallbackStart,
    });
  }
};
