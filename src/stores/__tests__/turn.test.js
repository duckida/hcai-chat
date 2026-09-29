import { beforeEach, describe, expect, it } from "vitest";
import {
  appendTurnDelta,
  beginTurn,
  clearTurnDeltas,
  readTurnDeltas,
  resetTurn,
  setTurn,
  turnStore,
  updateSandboxTools,
} from "@/stores/turn";

const snapshot = () => turnStore.getState();

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
    resetTurn();
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
    setTurn({ streamingError: { title: "old" }, contextUsage: 900 });

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

  it("keeps the live buffers and the rendered mirror in step", () => {
    appendTurnDelta("content", "Hello ");
    appendTurnDelta("thinking", "pondering");
    appendTurnDelta("content", "world");

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

    expect(readTurnDeltas().content).toBe("immutable");
    expect(snapshot().streamingContent).toBe("immutable");
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
    expect(readTurnDeltas()).toEqual({ content: "", thinking: "" });
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
