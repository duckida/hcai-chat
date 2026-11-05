import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInlineViewEntry,
  inlineViewKey,
  requestInlineView,
  resetInlineViewCache,
} from "../inline-view-cache";

const generateInlineView = vi.fn(async () => "<div>built</div>");
vi.mock("@/lib/api-client", () => ({
  generateInlineView: (...args) => generateInlineView(...args),
}));

const STORAGE_KEY = "hcai_inline_view_cache";

beforeEach(() => {
  resetInlineViewCache();
  generateInlineView.mockReset();
  generateInlineView.mockImplementation(async () => "<div>built</div>");
});

describe("inline view cache", () => {
  it("keys by model and brief, so one cannot answer the other", () => {
    expect(inlineViewKey("m", "a")).toBe(inlineViewKey("m", "a"));
    expect(inlineViewKey("m", "a")).not.toBe(inlineViewKey("m", "b"));
    expect(inlineViewKey("m", "a")).not.toBe(inlineViewKey("n", "a"));
  });

  it("generates once and serves the same document from memory", async () => {
    const key = inlineViewKey("m", "a chart");
    requestInlineView({ key, prompt: "a chart", model: "m" });
    await vi.waitFor(() =>
      expect(getInlineViewEntry(key)?.status).toBe("ready"),
    );
    requestInlineView({ key, prompt: "a chart", model: "m" });
    expect(generateInlineView).toHaveBeenCalledTimes(1);
  });

  it("reads a document persisted after hydration, so a switch cannot show less than a refresh", async () => {
    const key = inlineViewKey("m", "a chart");
    // Hydrate against an empty cache first, the way a page load does.
    expect(getInlineViewEntry(key)).toBe(null);

    // Another tab finishes the build and writes the shared storage.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [key]: "<div>x</div>" }));

    expect(getInlineViewEntry(key)).toEqual({
      status: "ready",
      html: "<div>x</div>",
    });
  });

  it("persists a finished document for the next page load", async () => {
    const key = inlineViewKey("m", "a chart");
    requestInlineView({ key, prompt: "a chart", model: "m" });
    await vi.waitFor(() =>
      expect(getInlineViewEntry(key)?.status).toBe("ready"),
    );

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual({
      [key]: "<div>built</div>",
    });
  });
});
