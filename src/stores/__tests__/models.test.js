import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let models;
let normalizeModelCatalog;
let splitModelName;
let loadModels;
let resetModels;
let modelsStore;
let useModels;
let getContextWindow;

const CATALOG = {
  data: [
    {
      id: "openai/gpt-4o",
      name: "OpenAI: GPT-4o",
      context_length: 128000,
      supported_parameters: ["tools", "temperature"],
      reasoning: {
        mandatory: false,
        supported_efforts: ["high", "medium", "low"],
        default_effort: "medium",
      },
    },
    {
      id: "google/gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash Lite",
      context_length: 1048576,
    },
    {
      id: "openai/gpt-4o",
      name: "OpenAI: GPT-4o",
      context_length: 128000,
    },
    {
      id: "anthropic/claude-sonnet-4-5",
      name: "anthropic/claude-sonnet-4-5",
    },
  ],
};

const mockFetch = (payload = CATALOG, ok = true) => {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
};

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllGlobals();
  models = await import("@/stores/models");
  normalizeModelCatalog = models.normalizeModelCatalog;
  splitModelName = models.splitModelName;
  loadModels = models.loadModels;
  resetModels = models.resetModels;
  modelsStore = models.modelsStore;
  useModels = models.useModels;
  getContextWindow = models.getContextWindow;
});

describe("splitModelName", () => {
  it("splits a colon-delimited display name into provider and name", () => {
    expect(splitModelName({ id: "openai/gpt-4o", name: "OpenAI: GPT-4o" })).toEqual([
      "OpenAI",
      "GPT-4o",
    ]);
  });

  it("derives the provider from the id slug when the name has no colon", () => {
    expect(
      splitModelName({ id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1" }),
    ).toEqual(["Google", "Gemini 3.1"]);
  });

  it("falls back to the id tail when the model has no name", () => {
    expect(splitModelName({ id: "anthropic/claude-sonnet-4-5" })).toEqual([
      "Anthropic",
      "claude-sonnet-4-5",
    ]);
    expect(splitModelName({ id: "m/x" })).toEqual(["M", "x"]);
  });
});

describe("normalizeModelCatalog", () => {
  it("groups by provider with providers and names sorted", () => {
    const { grouped } = normalizeModelCatalog(CATALOG);
    expect(Object.keys(grouped)).toEqual(["Anthropic", "Google", "OpenAI"]);
    expect(grouped.OpenAI.map((m) => m.name)).toEqual(["GPT-4o"]);
    expect(grouped.Google[0]).toEqual({
      id: "google/gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash Lite",
    });
  });

  it("drops duplicate ids", () => {
    const { grouped } = normalizeModelCatalog(CATALOG);
    expect(grouped.OpenAI).toHaveLength(1);
  });

  it("keeps the first record for a duplicate id, so its metadata survives", () => {
    const { toolsSupported } = normalizeModelCatalog(CATALOG);
    expect(toolsSupported["openai/gpt-4o"]).toBe(true);
  });

  it("derives the context-window map, defaulting when absent", () => {
    const { contextWindows } = normalizeModelCatalog(CATALOG);
    expect(contextWindows["openai/gpt-4o"]).toBe(128000);
    expect(contextWindows["google/gemini-3.1-flash-lite"]).toBe(1048576);
    expect(contextWindows["anthropic/claude-sonnet-4-5"]).toBe(128000);
  });

  it("marks tool support only when the catalog says so", () => {
    const { toolsSupported } = normalizeModelCatalog(CATALOG);
    expect(toolsSupported["openai/gpt-4o"]).toBe(true);
    expect(toolsSupported["google/gemini-3.1-flash-lite"]).toBe(false);
  });

  it("keeps each model's reasoning capabilities, and null for the models without", () => {
    const { reasoningByModel } = normalizeModelCatalog(CATALOG);
    expect(reasoningByModel["openai/gpt-4o"]).toEqual({
      mandatory: false,
      supported_efforts: ["high", "medium", "low"],
      default_effort: "medium",
    });
    // Null is a fact about the model — OpenRouter omits `reasoning` on models
    // that cannot reason, which is not the same as an id the catalog has never
    // seen (that key is simply absent).
    expect(reasoningByModel["google/gemini-3.1-flash-lite"]).toBeNull();
    expect(reasoningByModel["nobody/unknown"]).toBeUndefined();
  });

  it("tolerates a payload with no data array", () => {
    expect(normalizeModelCatalog(undefined)).toEqual({
      grouped: {},
      contextWindows: {},
      toolsSupported: {},
      reasoningByModel: {},
    });
    expect(normalizeModelCatalog({ data: "nope" }).grouped).toEqual({});
  });
});

describe("loadModels", () => {
  it("fetches the catalog and moves status to ready", async () => {
    const fetchMock = mockFetch();
    expect(modelsStore.getState().status).toBe("idle");

    await act(async () => {
      await loadModels();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/models");
    expect(modelsStore.getState().status).toBe("ready");
    expect(Object.keys(modelsStore.getState().grouped)).toContain("OpenAI");
  });

  it("shares one request between concurrent callers", async () => {
    const fetchMock = mockFetch();
    await act(async () => {
      await Promise.all([loadModels(), loadModels(), loadModels()]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not refetch a catalog that is already loaded", async () => {
    const fetchMock = mockFetch();
    await act(async () => {
      await loadModels();
    });
    await act(async () => {
      await loadModels();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records an error status when the request fails", async () => {
    mockFetch(CATALOG, false);
    await act(async () => {
      await loadModels();
    });
    expect(modelsStore.getState().status).toBe("error");
    expect(modelsStore.getState().grouped).toEqual({});
  });

  it("records an error status when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await act(async () => {
      await loadModels();
    });
    expect(modelsStore.getState().status).toBe("error");
  });

  it("retries after a failed load instead of staying latched", async () => {
    mockFetch(CATALOG, false);
    await act(async () => {
      await loadModels();
    });
    expect(modelsStore.getState().status).toBe("error");

    const okMock = mockFetch();
    await act(async () => {
      await loadModels();
    });
    expect(okMock).toHaveBeenCalledTimes(1);
    expect(modelsStore.getState().status).toBe("ready");
  });
});

describe("resetModels", () => {
  it("returns the store to its initial state", async () => {
    mockFetch();
    await act(async () => {
      await loadModels();
    });
    expect(modelsStore.getState().status).toBe("ready");

    act(() => resetModels());
    expect(modelsStore.getState()).toEqual({
      grouped: {},
      contextWindows: {},
      toolsSupported: {},
      reasoningByModel: {},
      status: "idle",
    });
  });
});

describe("useModels / getContextWindow", () => {
  it("subscribes to the catalog", async () => {
    mockFetch();
    const { result } = renderHook(() => useModels());
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await loadModels();
    });

    expect(result.current.status).toBe("ready");
    expect(Object.keys(result.current.grouped)).toContain("OpenAI");
  });

  it("keeps a selector snapshot referentially stable across renders", async () => {
    mockFetch();
    const { result, rerender } = renderHook(() => useModels((s) => s.grouped));
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
  });

  it("resolves the window for a known model and 0 for an unknown one", async () => {
    mockFetch();
    await act(async () => {
      await loadModels();
    });
    expect(getContextWindow("openai/gpt-4o")).toBe(128000);
    expect(getContextWindow("nope/nope")).toBe(0);
  });
});
