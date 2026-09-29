import { createStore, useStore } from "@/lib/store";

const initialState = {
  isLoading: false,
  streamingContent: "",
  streamingThinking: "",
  streamingError: null,
  streamingSandboxTools: [],
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
  turnStore.setState({
    streamingContent: "",
    streamingThinking: "",
    ...patch,
  });
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

export function useTurn() {
  return useStore(turnStore);
}
