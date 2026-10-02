import { createStore, useStore } from "@/lib/store";

const initialState = {
  isLoading: false,
  streamingContent: "",
  streamingThinking: "",
  streamingError: null,
  streamingSandboxTools: [],
  streamingToolChips: [],
  streamingConversationId: null,
  contextUsage: 0,
};

export const turnStore = createStore(initialState);

/**
 * Live accumulators for the in-flight response.
 *
 * `streamingContent`, `streamingThinking` and the predicted `contextUsage`
 * are only a mirror of these. The turn commits by reading the buffers, never
 * the rendered snapshot, so the tail of a stream cannot be lost when no
 * render happened between the last chunk and completion.
 *
 * Chunks arrive far faster than a screen can show them — a fast model pushes
 * dozens per second, and each store write re-renders the whole thread. The
 * buffers absorb that burst and exactly one notification per animation frame
 * carries it to the DOM, so streaming costs a fixed 60 renders a second
 * instead of one per token.
 */
const buffers = { content: "", thinking: "", contextUsage: null };

let frame = 0;

function cancelFrame() {
  if (!frame) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

function flushBuffers() {
  frame = 0;
  const patch = {
    streamingContent: buffers.content,
    streamingThinking: buffers.thinking,
  };
  if (buffers.contextUsage !== null) {
    patch.contextUsage = buffers.contextUsage;
    buffers.contextUsage = null;
  }
  turnStore.setState(patch);
}

function scheduleFlush() {
  if (frame) return;
  frame = requestAnimationFrame(flushBuffers);
}

function discardBuffers() {
  cancelFrame();
  buffers.content = "";
  buffers.thinking = "";
  buffers.contextUsage = null;
}

export function resetTurn() {
  discardBuffers();
  turnStore.setState({ ...initialState });
}

/**
 * Drop whatever a dead stream accumulated and optionally apply a patch in the
 * same notification — the fallback replay and every error path need both, and
 * two setState calls would flash an inconsistent frame in between.
 */
export function clearTurnDeltas(patch = {}) {
  discardBuffers();
  turnStore.setState((state) => ({
    streamingContent: "",
    streamingThinking: "",
    // Only when there is something to clear: a fresh [] would differ from
    // the state's own by reference and notify listeners over nothing.
    ...(state.streamingToolChips.length > 0 ? { streamingToolChips: [] } : {}),
    ...patch,
  }));
}

export function beginTurn(conversationId) {
  discardBuffers();
  turnStore.setState({
    ...initialState,
    isLoading: true,
    streamingConversationId: conversationId,
  });
}

export function appendTurnDelta(type, text) {
  if (type === "thinking") {
    buffers.thinking += text;
  } else {
    buffers.content += text;
  }
  scheduleFlush();
}

/**
 * Queue a predicted usage total. Writing it straight to the store would
 * re-render once per token, so it rides the same frame as the text it is
 * derived from.
 */
export function predictContextUsage(contextUsage) {
  buffers.contextUsage = contextUsage;
  scheduleFlush();
}

/**
 * Record a server-reported usage total. An actual number always wins over a
 * buffered prediction: dropping the pending value here stops a frame that was
 * scheduled during the last chunk from overwriting the real total with the
 * estimate.
 */
export function setContextUsage(contextUsage) {
  buffers.contextUsage = null;
  turnStore.setState({ contextUsage });
}

export function readTurnDeltas() {
  return { content: buffers.content, thinking: buffers.thinking };
}

export function updateSandboxTools(updater) {
  turnStore.setState((state) => ({
    streamingSandboxTools: updater(state.streamingSandboxTools),
  }));
}

/**
 * Tool calls that belong in the thinking block, as chips pinned to the offset
 * they arrived at in the reasoning. Like the sandbox tools these write the
 * store directly rather than riding a frame: a turn makes a handful of tool
 * calls, and the ordering they need is precise rather than smooth.
 *
 * Sandbox tools are never appended here — their transcript is the side panel,
 * and no trace of a command belongs in the thread. The caller filters, and
 * `appendTurnChipArgs` no-ops for indexes that never got a chip, so argument
 * deltas for a sandbox tool land nowhere.
 */
export function appendTurnChip({ index, tool }) {
  const chips = turnStore.getState().streamingToolChips;
  if (chips.some((chip) => chip.index === index)) return;
  turnStore.setState({
    streamingToolChips: [
      ...chips,
      {
        index,
        tool,
        // The *buffer*, not the rendered mirror: the committed thinking is
        // the buffer, so the offset has to match it exactly even when the
        // last frame has not painted yet.
        at: buffers.thinking.length,
        args: "",
      },
    ],
  });
}

/**
 * Accumulate a tool call's streamed arguments and promote them to a label as
 * soon as they parse. Arguments arrive as fragments after the tool-input-start
 * event, so most of the time this sees half a JSON document and must leave the
 * previous label alone.
 */
export function appendTurnChipArgs(index, fragment) {
  const state = turnStore.getState();
  const chip = state.streamingToolChips.find((c) => c.index === index);
  if (!chip) return;
  const args = chip.args + fragment;
  const label = parseChipLabel(args) ?? chip.label;
  turnStore.setState({
    streamingToolChips: state.streamingToolChips.map((c) =>
      c.index === index ? { ...c, args, label } : c,
    ),
  });
}

/**
 * A search's domains fill the chip that was pinned where the call happened.
 * The sources arrive one event later (at the step's end, before the
 * post-search reasoning), so until now the chip showed only the query. The
 * *oldest* unfilled search chip wins: two searches in one turn must fill in
 * call order, not whichever the model mentioned last.
 */
export function fillLastSearchChip(rawSources) {
  // One pill per site: the first result for a domain owns the link, so a
  // second hit from the same site adds no width — but the href stays the
  // full result URL, so the pill opens what the search actually returned.
  const entries = [];
  const seen = new Set();
  for (const source of rawSources) {
    const entry = sourceEntry(source);
    if (!entry || seen.has(entry.domain)) continue;
    seen.add(entry.domain);
    entries.push(entry);
  }
  const chips = turnStore.getState().streamingToolChips;
  let target = null;
  for (const chip of chips) {
    if (chip.tool === "web_search" && !chip.sources) {
      target = chip;
      break;
    }
  }
  if (!target) return;
  turnStore.setState({
    streamingToolChips: chips.map((chip) =>
      chip === target ? { ...chip, sources: entries } : chip,
    ),
  });
}

/** The chips as the commit reads them — a copy, so the stream cannot be mutated from outside. */
export function readTurnChips() {
  return [...turnStore.getState().streamingToolChips];
}

function parseChipLabel(args) {
  if (!args) return undefined;
  try {
    const parsed = JSON.parse(args);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.expression === "string") return parsed.expression;
      if (typeof parsed.query === "string") return parsed.query;
    }
  } catch {}
  return undefined;
}

/**
 * One pill entry: where it points (the full result URL — what a click should
 * open) and what it says (the bare domain — a path makes pills unusably
 * wide). Citations arrive as URL strings or `{ url }`/`{ link }` objects;
 * bare domains without a scheme still get one.
 */
function sourceEntry(source) {
  const raw =
    typeof source === "string" ? source : source?.url || source?.link || "";
  if (!raw || /\s/.test(raw)) return null; // free text earns no pill
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return {
      domain: url.hostname.replace(/^www\./, ""),
      href: url.toString(),
    };
  } catch {
    // Not parseable — a citation is sometimes a bare domain already.
    return raw.includes(".")
      ? {
          domain: raw.replace(/^www\./, ""),
          href: `https://${raw}`,
        }
      : null;
  }
}

export function useTurn() {
  return useStore(turnStore);
}
