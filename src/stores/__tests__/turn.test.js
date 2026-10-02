import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendTurnChip,
  appendTurnChipArgs,
  appendTurnDelta,
  beginTurn,
  clearTurnDeltas,
  fillLastSearchChip,
  predictContextUsage,
  readTurnChips,
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
      streamingToolChips: [],
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
      streamingToolChips: [],
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

  describe("tool-call chips", () => {
    it("pins a chip to the thinking buffer, not the rendered mirror", () => {
      appendTurnDelta("thinking", "let me check this ");
      // The buffer has the text immediately; the rendered mirror does not
      // paint until the next frame. The commit reads the buffer, so the
      // offset has to come from there too, or the chip lands wherever the
      // last paint happened to be.
      expect(readTurnDeltas().thinking).toBe("let me check this ");
      expect(snapshot().streamingThinking).toBe("");

      appendTurnChip({ index: 0, tool: "javascript_calculator" });
      expect(readTurnChips()[0].at).toBe("let me check this ".length);

      appendTurnDelta("thinking", "afterwards");
      flushFrames();
      expect(readTurnDeltas().thinking).toBe("let me check this afterwards");
      // The reasoning grew past the chip; the pin did not move.
      expect(readTurnChips()[0].at).toBe("let me check this ".length);
    });

    it("keeps one chip per call even when start and completion both report", () => {
      appendTurnChip({ index: 0, tool: "web_search" });
      appendTurnChip({ index: 0, tool: "web_search" });

      expect(readTurnChips()).toHaveLength(1);
    });

    it("promotes argument fragments to a label as soon as they parse", () => {
      appendTurnChip({ index: 0, tool: "javascript_calculator" });

      // Half a JSON document: nothing to show yet, and no throwing either.
      appendTurnChipArgs(0, '{"expres');
      expect(readTurnChips()[0].label).toBeUndefined();

      appendTurnChipArgs(0, 'sion":"5 + 5"}');
      expect(readTurnChips()[0].args).toBe('{"expression":"5 + 5"}');
      expect(readTurnChips()[0].label).toBe("5 + 5");
    });

    it("labels a search from its query", () => {
      appendTurnChip({ index: 0, tool: "web_search" });
      appendTurnChipArgs(0, '{"query":"opencode vs claude"}');

      expect(readTurnChips()[0].label).toBe("opencode vs claude");
    });

    it("lets argument fragments for an index with no chip land nowhere", () => {
      appendTurnChipArgs(7, '{"expression":"1 + 1"}');

      expect(readTurnChips()).toEqual([]);
    });

    it("fills search chips in call order, keeping only real sites", () => {
      appendTurnChip({ index: 0, tool: "web_search" });
      appendTurnChipArgs(0, '{"query":"first"}');
      appendTurnChip({ index: 1, tool: "web_search" });
      appendTurnChipArgs(1, '{"query":"second"}');

      fillLastSearchChip([
        { url: "https://www.reddit.com/r/x" },
        "txt.com",
        { url: "https://www.reddit.com/r/y" },
        "just some words",
      ]);
      const [first, second] = readTurnChips();
      // Oldest unfilled wins, www is stripped, the same site twice is one
      // pill (whose link is the *first* result), free text is not a domain,
      // and every pill keeps its full result URL as the target.
      expect(first.sources).toEqual([
        { domain: "reddit.com", href: "https://www.reddit.com/r/x" },
        { domain: "txt.com", href: "https://txt.com/" },
      ]);
      expect(second.sources).toBeUndefined();

      fillLastSearchChip(["https://example.org/a"]);
      expect(readTurnChips()[0].sources).toEqual([
        { domain: "reddit.com", href: "https://www.reddit.com/r/x" },
        { domain: "txt.com", href: "https://txt.com/" },
      ]);
      expect(readTurnChips()[1].sources).toEqual([
        { domain: "example.org", href: "https://example.org/a" },
      ]);
    });

    it("drops chips with the reasoning they are pinned to", () => {
      appendTurnDelta("thinking", "checking ");
      appendTurnChip({ index: 0, tool: "javascript_calculator" });

      clearTurnDeltas();

      expect(readTurnChips()).toEqual([]);
      expect(readTurnDeltas()).toEqual({ content: "", thinking: "" });
    });

    it("hands back a copy so the stream cannot be mutated from outside", () => {
      appendTurnChip({ index: 0, tool: "web_search" });

      const chips = readTurnChips();
      chips.push({ index: 9, tool: "something", at: 0 });

      expect(readTurnChips()).toHaveLength(1);
    });
  });
});
