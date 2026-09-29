import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendTurnDelta,
  beginTurn,
  clearTurnDeltas,
  predictContextUsage,
  readTurnDeltas,
  resetTurn,
  setContextUsage,
  turnStore,
  updateSandboxTools,
} from "@/stores/turn";

const snapshot = () => turnStore.getState();

// A controllable animation frame: the store schedules one flush per frame, so
// tests hold the frame open to inspect what has *not* been published yet, and
// run it to see exactly one notification land.
const frames = new Map();
let nextFrameId = 1;

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback();
}

function countNotifications() {
  let count = 0;
  const unsubscribe = turnStore.subscribe(() => {
    count += 1;
  });
  return {
    get count() {
      return count;
    },
    stop: unsubscribe,
  };
}

describe("turn store", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id) => {
        frames.delete(id);
      }),
    );
    resetTurn();
  });

  afterEach(() => {
    frames.clear();
    vi.unstubAllGlobals();
  });

  it("starts idle and empty", () => {
    expect(snapshot()).toEqual({
      isLoading: false,
      streamingContent: "",
      streamingThinking: "",
      streamingError: null,
      streamingSandboxTools: [],
      streamingConversationId: null,
      contextUsage: 0,
    });
  });

  it("beginTurn claims the turn for a conversation and clears prior deltas", () => {
    appendTurnDelta("content", "left over from the last turn");
    setContextUsage(900);

    beginTurn("conv-1");

    expect(snapshot()).toEqual({
      isLoading: true,
      streamingContent: "",
      streamingThinking: "",
      streamingError: null,
      streamingSandboxTools: [],
      streamingConversationId: "conv-1",
      contextUsage: 0,
    });
    expect(readTurnDeltas()).toEqual({ content: "", thinking: "" });
  });

  it("keeps the live buffers and the rendered mirror in step after a frame", () => {
    appendTurnDelta("content", "Hello ");
    appendTurnDelta("thinking", "pondering");
    appendTurnDelta("content", "world");
    flushFrames();

    expect(readTurnDeltas()).toEqual({
      content: "Hello world",
      thinking: "pondering",
    });
    expect(snapshot().streamingContent).toBe("Hello world");
    expect(snapshot().streamingThinking).toBe("pondering");
  });

  it("hands back a copy so a caller cannot mutate the buffers", () => {
    appendTurnDelta("content", "immutable");
    const deltas = readTurnDeltas();
    deltas.content = "tampered";
    flushFrames();

    expect(readTurnDeltas().content).toBe("immutable");
    expect(snapshot().streamingContent).toBe("immutable");
  });

  it("coalesces a burst of deltas into a single frame notification", () => {
    const watcher = countNotifications();

    appendTurnDelta("content", "one ");
    appendTurnDelta("content", "two ");
    appendTurnDelta("content", "three");
    appendTurnDelta("thinking", "hmm");
    predictContextUsage(640);

    // Nothing has reached the store yet: the commit path reads the buffers,
    // and the DOM update waits for the frame.
    expect(frames.size).toBe(1);
    expect(snapshot().streamingContent).toBe("");
    expect(snapshot().contextUsage).toBe(0);
    expect(watcher.count).toBe(0);

    flushFrames();
    watcher.stop();

    expect(watcher.count).toBe(1);
    expect(snapshot().streamingContent).toBe("one two three");
    expect(snapshot().streamingThinking).toBe("hmm");
    expect(snapshot().contextUsage).toBe(640);
  });

  it("publishes the whole buffer, not just the delta that followed the frame", () => {
    appendTurnDelta("content", "first");
    flushFrames();
    appendTurnDelta("content", " second");
    flushFrames();

    expect(snapshot().streamingContent).toBe("first second");
  });

  it("lets an actual usage total win over a buffered prediction", () => {
    predictContextUsage(640);
    setContextUsage(105);
    flushFrames();

    expect(snapshot().contextUsage).toBe(105);
  });

  it("cancels the pending frame when the turn is cleared", () => {
    appendTurnDelta("content", "partial answer");
    const watcher = countNotifications();

    clearTurnDeltas({ isLoading: false, streamingError: { title: "boom" } });
    flushFrames();
    watcher.stop();

    expect(watcher.count).toBe(1);
    expect(snapshot()).toMatchObject({
      isLoading: false,
      streamingContent: "",
      streamingThinking: "",
      streamingError: { title: "boom" },
    });
    expect(readTurnDeltas()).toEqual({ content: "", thinking: "" });
  });

  it("clears deltas and applies its patch in a single notification", () => {
    appendTurnDelta("content", "partial answer");
    const watcher = countNotifications();

    clearTurnDeltas({ isLoading: false, streamingError: { title: "boom" } });
    watcher.stop();

    expect(watcher.count).toBe(1);
    expect(snapshot()).toMatchObject({
      isLoading: false,
      streamingContent: "",
      streamingThinking: "",
      streamingError: { title: "boom" },
    });
  });

  it("does not notify when the cleared patch changes nothing", () => {
    const watcher = countNotifications();
    clearTurnDeltas();
    watcher.stop();

    expect(watcher.count).toBe(0);
  });

  it("updateSandboxTools derives from the current list", () => {
    updateSandboxTools((prev) => [
      ...prev,
      { index: 0, tool: "execute_code", status: "running" },
    ]);
    updateSandboxTools((prev) =>
      prev.map((t) => ({ ...t, status: "complete" })),
    );

    expect(snapshot().streamingSandboxTools).toEqual([
      { index: 0, tool: "execute_code", status: "complete" },
    ]);

    resetTurn();
    expect(snapshot().streamingSandboxTools).toEqual([]);
  });
});
