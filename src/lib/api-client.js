import { sanitizeMessages } from "./messages";
import { createSseParser } from "./sse-parser";
import { DEFAULT_THINKING_LEVEL } from "./thinking";

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
  providerSlug = null,
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
        ...(providerSlug ? { providerSlug } : {}),
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
  thinkingLevel,
  artifacts,
  maxTokens,
  agentMode,
  conversationId,
  e2bApiKey,
  sandboxId,
  tools,
  toolChoice,
  singleRound = false,
  providerSlug = null,
}) {
  const body = {
    model,
    messages,
    apiKey,
    thinkingLevel,
    artifacts,
  };

  if (maxTokens) body.max_tokens = maxTokens;
  if (providerSlug) body.providerSlug = providerSlug;

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

  // Client-side agent loop: one step per request, tools never executed
  // server-side — the round ends with tool calls handed back.
  if (singleRound) body.singleRound = true;

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
 * keepalive comment every 5s, so 60s without a byte means the connection is
 * wedged (a throttled background tab, a dead proxy) — not that the model is
 * still thinking. Matches Libre's 60s tolerance.
 */
const STALL_TIMEOUT_MS = 60_000;

/**
 * Decide what an ended (or thrown) request means, and finish it when the
 * server vouched for it. Order matters. Nothing delivered is "empty" —
 * checked before the marker, because a marker that carried no content is
 * not an answer and has always been replayed. The `[DONE]` marker or an
 * explicit error frame is "complete"; the error frame was already routed
 * to onError, so it must never be replayed over. Content or a
 * search/sandbox result without the marker is a connection that died
 * mid-answer: "continue", because there is now a partial worth continuing
 * — and continuing never re-runs the search or tool work, which is what
 * used to force those turns to complete silently (finding 17). A thinking-only
 * tail is now also "continue": the assistant turn sent back with its
 * reasoning_details attached lets the model resume thinking where the cut
 * happened; only a tool-call-only ending (nothing that could anchor a text
 * continuation) still falls back to "retry".
 *
 * @returns {Promise<"empty" | "complete" | "continue" | "retry">}
 */
async function classifyEnding(router, onComplete) {
  if (!router.anyDelivered()) return "empty";

  if (router.wasCompleted()) {
    await onComplete?.();
    return "complete";
  }

  if (router.delivered.serverError) {
    await onComplete?.();
    return "complete";
  }

  console.warn(
    "[stream] EOF without the [DONE] marker after delivered content — the response is truncated",
  );
  return router.delivered.content ||
    router.delivered.serverEvent ||
    router.delivered.thinking
    ? "continue"
    : "retry";
}

/**
 * Read the SSE body to its end and decide what its ending means. A partial
 * frame left in the buffer at EOF cannot be salvaged, so it is dispatched as
 * is and ignored if it does not parse — we complete the message with what we
 * have rather than hanging.
 *
 * @returns {Promise<"empty" | "complete" | "continue" | "retry">} the
 *   ending's classification — see classifyEnding for the precedence
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

  // The ending's meaning comes from what was delivered, not from the bytes:
  // see classifyEnding for the precedence and why it is ordered that way.
  return await classifyEnding(router, onComplete);
}

/**
 * The one whole-answer replay, and the only one: it covers endings with
 * nothing to continue — an empty stream, or thinking/tool-call frames with
 * no text. It streams like the first attempt, with a fresh frame router so
 * this attempt's ending is judged on its own evidence — the first attempt's
 * delivered record would call any empty ending a truncation. Streaming is
 * load-bearing, not stylistic: a non-streaming replay holds the connection
 * with *zero bytes* for the whole regeneration, which is exactly what a
 * proxy read-timeout kills, so a long answer can finish at the provider and
 * still die on the way back (finding 16 — it did, billed at 44k tokens /
 * 8m28s, while the client saw a plain-text 502). A replay that delivers
 * text and is then cut hands its partial to `continuePartial` rather than
 * regenerating a third time; a replay that delivers nothing reports the
 * error, and the buffers keep their partial because `onFallbackStart` was
 * never asked to discard it.
 *
 * @param {object} body the request, already sanitized by postChat
 * @param {object} handlers onChunk / onError / onComplete / onFallbackStart
 *   plus the chat's frame handlers (the router takes them directly)
 * @param {{ content: string }} mirror this turn's delivered content, so a
 *   continuation chained from here continues from the replay's partial
 */
async function replayOnce(body, model, handlers, mirror) {
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
    // The replay regenerates the whole answer, so callers must discard
    // whatever the dead stream already accumulated — otherwise the replay
    // appends to it and the response appears twice. If no byte ever arrives,
    // the buffers keep their partial and the error below commits it.
    onFallbackStart?.();
    const outcome = await streamOnce(body, retryRouter, model, onComplete);
    if (outcome === "complete") return;
    if (outcome === "continue") {
      // The replay delivered text and then died too. Its partial is now the
      // thing to continue — one replay, then bounded continuations, never a
      // second regeneration (finding 17).
      return await continuePartial(body, model, handlers, mirror);
    }
    // No second replay: a flaky network must not become a regeneration
    // loop. The error commits whatever partial arrived.
    onError(
      new Error(
        retryRouter.anyDelivered()
          ? `Connection lost during the retry — the response for "${model}" was cut off before it finished.`
          : `No response received from model "${model}". The model may be overloaded or unavailable.`,
      ),
    );
  } catch (error) {
    onError(error);
  }
}

/**
 * The instruction appended when a stream dies mid-answer. The contract is
 * narrow on purpose: start where it stopped, do not repeat — a model that
 * restarts the answer is what the overlap filter below exists to absorb.
 */
const CONTINUE_PROMPT =
  "Your previous response was cut off before it finished. Continue it exactly where it stopped — start with the very next word. Do not repeat, restart, summarize, or acknowledge this message.";

/** Total continuation legs, counting legs that delivered nothing. */
const MAX_CONTINUE_LEGS = 3;
/** Consecutive continuation legs that may deliver nothing before giving up. */
const MAX_EMPTY_LEGS = 2;

/**
 * A leg's first bytes are checked against this much of the partial's tail.
 * MIN_TRIM_OVERLAP is the floor: at a few characters a match is as likely
 * to be a legitimate word as a restart, and trimming a real word breaks the
 * sentence the continuation exists to finish. CONTINUE_FLUSH_CHARS is how
 * long the seam is held for inspection — long enough for a repeated tail to
 * show itself whole — then everything streams through untouched.
 */
const CONTINUE_TRIM_WINDOW = 240;
const CONTINUE_FLUSH_CHARS = 160;
const MIN_TRIM_OVERLAP = 12;

/**
 * Find the longest prefix of the incoming text the partial already ends
 * with and drop it: a model that ignores the instruction and repeats the
 * tail it was shown loses the repetition, not the answer.
 */
function trimOverlap(tail, incoming) {
  const window = tail.slice(-CONTINUE_TRIM_WINDOW);
  const maxK = Math.min(window.length, incoming.length);
  for (let k = maxK; k >= MIN_TRIM_OVERLAP; k--) {
    if (window.endsWith(incoming.slice(0, k))) return incoming.slice(k);
  }
  return incoming;
}

/** Holds a leg's seam, trims it once when released, passes the rest through. */
function createOverlapFilter(tail) {
  let held = "";
  let released = false;
  return {
    push(text) {
      if (released) return text;
      held += text;
      if (held.length < CONTINUE_FLUSH_CHARS) return null;
      released = true;
      const out = trimOverlap(tail, held);
      held = "";
      return out;
    },
    flush() {
      if (released) return "";
      released = true;
      const out = trimOverlap(tail, held);
      held = "";
      return out;
    },
  };
}

/**
 * Ask for the rest of an answer whose connection died mid-generation.
 *
 * A full replay regenerates the entire response — exactly the wrong shape
 * under a deterministic killer (a host or proxy cap that ends any request
 * running longer than T): the replay is the same length as the original and
 * dies at the same point, which is what "retry failed" looked like in
 * production (finding 17). A continuation generates only the remainder,
 * appends it to the partial already on screen, and re-runs no search or
 * tool work — which is why search/sandbox cuts, forced to complete silently
 * before, can come through here instead of duplicating their side effects.
 *
 * Two budgets bound the loop: MAX_CONTINUE_LEGS legs in total (each cut
 * leg leaves a smaller remainder, so progress converges) and MAX_EMPTY_LEGS
 * consecutive legs that deliver nothing (a dead endpoint must not spin; per
 * the product decision, an empty leg is continued again rather than failing
 * outright). An exhausted budget reports the same errors the replay path
 * always did, so the partial commits alongside them.
 *
 * @param {{ content: string; thinking: string }} mirror this turn's delivered
 *   content and thinking — the partial to continue from, and the tails the
 *   overlap filters guard
 */
async function continuePartial(body, model, handlers, mirror) {
  const {
    onChunk,
    onError,
    onToolCall,
    onSearchResult,
    onMetrics,
    onSandboxResult,
    onComplete,
  } = handlers;

  let legs = 0;
  let emptyLegs = 0;
  let lastError = null;
  let lastLegThrew = false;
  let lastLegDelivered = false;

  while (legs < MAX_CONTINUE_LEGS && emptyLegs < MAX_EMPTY_LEGS) {
    legs++;
    lastLegThrew = false;

    const partial = mirror.content;
    const thinkingPartial = mirror.thinking;
    const messages = [
      ...body.messages,
      ...(partial || thinkingPartial
        ? [
            {
              role: "assistant",
              content: partial || "",
              // `thinking` is what messages.js's sanitizer recognizes as
              // sendable content. Without it a thinking-only continuation
              // turn is DROPPED server-side, and the model receives the
              // continue instruction with no turn to continue — the "I have
              // no actual previous content" reply. `reasoning_details` is
              // what goes on the wire so the model resumes the reasoning.
              ...(thinkingPartial
                ? {
                    thinking: thinkingPartial,
                    reasoning_details: [
                      { type: "reasoning.text", text: thinkingPartial },
                    ],
                  }
                : {}),
            },
          ]
        : []),
      { role: "user", content: CONTINUE_PROMPT },
    ];
    // route.js rejects more than 200 messages; a history already at the cap
    // must not turn the continuation into a 400.
    if (messages.length > 200) messages.splice(0, messages.length - 200);

    // Only the seam can repeat: hold the leg's first bytes until the trim
    // window fills, trim against the partial, then stream untouched.
    // Both content and reasoning get their own filters so a thinking-only
    // interruption continues the reasoning, not just the prose.
    const filter = createOverlapFilter(partial.slice(-CONTINUE_TRIM_WINDOW));
    const thinkingFilter = createOverlapFilter(
      thinkingPartial.slice(-CONTINUE_TRIM_WINDOW),
    );
    const emit = (text) => {
      // handlers.onChunk mirrors content into the partial, so the next leg
      // continues from this leg's text too.
      if (text) onChunk(text, "content");
    };
    const emitThinking = (text) => {
      if (text) onChunk(text, "thinking");
    };
    const legRouter = createFrameRouter({
      model,
      onChunk: (chunk, type) => {
        if (type === "content") return emit(filter.push(chunk));
        if (type === "thinking")
          return emitThinking(thinkingFilter.push(chunk));
        return onChunk(chunk, type);
      },
      onError,
      onToolCall,
      onSearchResult,
      onMetrics,
      onSandboxResult,
    });
    const flush = () => emit(filter.flush());
    const finish = async () => {
      flush();
      emitThinking(thinkingFilter.flush());
      await onComplete?.();
    };

    let outcome;
    try {
      outcome = await streamOnce(
        { ...body, messages },
        legRouter,
        model,
        finish,
      );
    } catch (error) {
      lastLegThrew = true;
      lastError = error;
      outcome = await classifyEnding(legRouter, finish);
    } finally {
      // Held bytes must land before the next leg — or before the error
      // below commits — never after.
      flush();
      emitThinking(thinkingFilter.flush());
    }
    lastLegDelivered = legRouter.anyDelivered();

    if (outcome === "complete") return;
    if (outcome === "empty") emptyLegs++;
    else emptyLegs = 0;
  }

  if (lastLegThrew && lastError) {
    onError(lastError);
    return;
  }
  onError(
    new Error(
      lastLegDelivered
        ? `Connection lost during the retry — the response for "${model}" was cut off before it finished.`
        : `No response received from model "${model}". The model may be overloaded or unavailable.`,
    ),
  );
}

/**
 * Stream a chat completion from /api/chat.
 *
 * Takes a single options object so call sites stay readable as new parameters
 * are added. Frames are split on blank-line SSE boundaries, so a partial frame
 * (bytes cut mid-JSON by a dropped connection) waits in the buffer for more
 * data instead of being silently dropped.
 *
 * An ending is judged by what the server actually delivered, not by the
 * bytes (see classifyEnding). A turn that never started — no delta at all —
 * gets exactly one whole-answer replay: there is nothing to continue from,
 * and an empty ending is the oldest retry invariant here. The replay still
 * streams for the reason the first attempt does: the server's keepalives
 * and the deltas keep bytes flowing, so a proxy cannot idle-timeout a long
 * regeneration the way a silent non-streaming request could (finding 16).
 *
 * A turn whose connection died after delivering text, a search result, or a
 * sandbox result gets a **continuation** instead: the same request with the
 * partial appended as the assistant's turn and a "continue where you
 * stopped" instruction, so only the remainder is generated (finding 17 — a
 * full replay under a deterministic cap dies at the same length it died the
 * first time). Continuations append to what is on screen, never clear it,
 * never re-run search or tool work, and are bounded by MAX_CONTINUE_LEGS /
 * MAX_EMPTY_LEGS. A delivered error frame completes — already surfaced — and
 * no path regenerates an answer that already has text.
 *
 * @param {object} options
 */
export const streamChatCompletion = async ({
  messages,
  model = "deepseek/deepseek-v4.1-flash",
  onChunk,
  onError,
  onComplete,
  thinkingLevel = DEFAULT_THINKING_LEVEL,
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
  singleRound = false,
  providerSlug = null,
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
    thinkingLevel,
    artifacts,
    maxTokens,
    agentMode,
    conversationId,
    e2bApiKey,
    sandboxId,
    tools,
    toolChoice,
    singleRound,
    providerSlug,
  });

  // The mirror is this turn's delivered content and thinking, for the one
  // place that needs them: a continuation must send back the partial it is
  // continuing. Every router is fed through the wrapper below, so the mirror
  // stays in step with what is on screen — including across a replay, whose
  // first chunk clears the store's partial (pendingReplayClear) while the
  // mirror keeps accumulating.
  const mirror = { content: "", thinking: "" };
  const mirroredHandlers = {
    onChunk: (chunk, type) => {
      if (type === "content") mirror.content += chunk;
      if (type === "thinking") mirror.thinking += chunk;
      onChunk(chunk, type);
    },
    onError,
    onToolCall,
    onSearchResult,
    onMetrics,
    onSandboxResult,
    onComplete,
    onFallbackStart,
  };

  const router = createFrameRouter({
    model,
    onChunk: mirroredHandlers.onChunk,
    onError,
    onToolCall,
    onSearchResult,
    onMetrics,
    onSandboxResult,
  });

  let outcome;
  try {
    outcome = await streamOnce(body, router, model, onComplete);
  } catch (error) {
    // A reader that dies mid-stream lands here too — classify by what the
    // attempt managed to deliver instead of blindly replaying over it.
    console.warn("[stream] Streaming failed:", error.message);
    outcome = await classifyEnding(router, onComplete);
  }

  if (outcome === "empty" || outcome === "retry") {
    // Nothing to continue from (or only thinking): one whole-answer replay.
    await replayOnce(body, model, mirroredHandlers, mirror);
  } else if (outcome === "continue") {
    await continuePartial(body, model, mirroredHandlers, mirror);
  }
  // "complete": streamOnce already ran onComplete.
};
