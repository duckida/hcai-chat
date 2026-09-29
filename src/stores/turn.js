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
 * `streamingContent` and `streamingThinking` are only a mirror of these
 * buffers. The turn commits by reading the buffers, never the rendered
 * snapshot, so the tail of a stream cannot be lost when no render happened
 * between the last chunk and completion.
 */
const buffers = { content: "", thinking: "" };

export function resetTurn() {
  buffers.content = "";
  buffers.thinking = "";
  turnStore.setState({ ...initialState });
}

/**
 * Drop whatever a dead stream accumulated and optionally apply a patch in the
 * same notification — the fallback replay and every error path need both, and
 * two setState calls would flash an inconsistent frame in between.
 */
export function clearTurnDeltas(patch = {}) {
  buffers.content = "";
  buffers.thinking = "";
  turnStore.setState({
    streamingContent: "",
    streamingThinking: "",
    ...patch,
  });
}

export function beginTurn(conversationId) {
  buffers.content = "";
  buffers.thinking = "";
  turnStore.setState({
    ...initialState,
    isLoading: true,
    streamingConversationId: conversationId,
  });
}

export function appendTurnDelta(type, text) {
  if (type === "thinking") {
    buffers.thinking += text;
    turnStore.setState({ streamingThinking: buffers.thinking });
    return;
  }
  buffers.content += text;
  turnStore.setState({ streamingContent: buffers.content });
}

export function readTurnDeltas() {
  return { content: buffers.content, thinking: buffers.thinking };
}

export function setTurn(patch) {
  turnStore.setState(patch);
}

export function updateSandboxTools(updater) {
  turnStore.setState((state) => ({
    streamingSandboxTools: updater(state.streamingSandboxTools),
  }));
}

export function useTurn() {
  return useStore(turnStore);
}
