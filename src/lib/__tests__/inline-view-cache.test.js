import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptInlineView,
  getInlineViewEntry,
  inlineViewKey,
  legacyInlineViewKey,
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
  it("keys by the brief alone, so one brief cannot answer another", () => {
    expect(inlineViewKey("a")).toBe(inlineViewKey("a"));
    expect(inlineViewKey("a")).not.toBe(inlineViewKey("b"));
    expect(inlineViewKey("")).toBe(inlineViewKey(""));
  });

  it("keeps the document when the builder model changes", async () => {
    const key = inlineViewKey("a chart");
    requestInlineView({ key, prompt: "a chart", model: "first/model" });
    await vi.waitFor(() =>
      expect(getInlineViewEntry(key)?.status).toBe("ready"),
    );

    // Another model is now selected, but the view is already part of history:
    // asking for it again must serve the stored document, not regenerate it.
    const secondKey = inlineViewKey("a chart");
    expect(getInlineViewEntry(secondKey)).toEqual({
      status: "ready",
      html: "<div>built</div>",
    });
    requestInlineView({
      key: secondKey,
      prompt: "a chart",
      model: "second/model",
    });
    expect(generateInlineView).toHaveBeenCalledTimes(1);
    expect(generateInlineView).toHaveBeenCalledWith("a chart", "first/model", null);
  });

  it("generates once and serves the same document from memory", async () => {
    const key = inlineViewKey("a chart");
    requestInlineView({ key, prompt: "a chart", model: "m" });
    await vi.waitFor(() =>
      expect(getInlineViewEntry(key)?.status).toBe("ready"),
    );
    requestInlineView({ key, prompt: "a chart", model: "m" });
    expect(generateInlineView).toHaveBeenCalledTimes(1);
  });

  it("reads a document persisted after hydration, so a switch cannot show less than a refresh", async () => {
    const key = inlineViewKey("a chart");
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
    const key = inlineViewKey("a chart");
    requestInlineView({ key, prompt: "a chart", model: "m" });
    await vi.waitFor(() =>
      expect(getInlineViewEntry(key)?.status).toBe("ready"),
    );

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual({
      [key]: "<div>built</div>",
    });
  });
});

describe("documents cached under the old model + brief key", () => {
  const prompt = "a chart";
  const model = "first/model";
  const legacyKey = legacyInlineViewKey(model, prompt);
  const key = inlineViewKey(prompt);

  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [legacyKey]: "<div>old build</div>" }),
    );
  });

  it("serves an existing document under the stable key without regenerating it", async () => {
    expect(getInlineViewEntry(key, legacyKey)).toEqual({
      status: "ready",
      html: "<div>old build</div>",
    });

    requestInlineView({ key, prompt, model: "second/model" });
    expect(generateInlineView).not.toHaveBeenCalled();
  });

  it("moves the adopted document to the stable key so it survives a later model change", () => {
    getInlineViewEntry(key, legacyKey);
    adoptInlineView(key, legacyKey);

    // The old key may keep its copy; what matters is that the stable key now
    // names the same document, so a later model change still finds it.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))[key]).toBe(
      "<div>old build</div>",
    );
  });

  it("does not overwrite a stable document that is already stored", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [key]: "<div>new build</div>", [legacyKey]: "<div>old build</div>" }),
    );
    adoptInlineView(key, legacyKey);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))[key]).toBe(
      "<div>new build</div>",
    );
  });
});
