import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_MODEL = "google/gemini-3.1-flash-lite";

describe("getModelPricingMap", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches pricing data from the /api/pricing proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            [TEST_MODEL]: { input: 0.0001, output: 0.0002 },
            "other-model": { input: 0.001, output: 0.002 },
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getModelPricingMap } = await import("../model-pricing");
    const map = await getModelPricingMap();
    expect(fetchMock).toHaveBeenCalledWith("/api/pricing");
    expect(map[TEST_MODEL]).toEqual({ input: 0.0001, output: 0.0002 });
    expect(map["other-model"]).toEqual({ input: 0.001, output: 0.002 });
  });

  it("caches results within the TTL window", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getModelPricingMap } = await import("../model-pricing");
    await getModelPricingMap();
    await getModelPricingMap();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the cache TTL expires", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getModelPricingMap } = await import("../model-pricing");
    await getModelPricingMap();
    // Advance 6 minutes (TTL is 5 min)
    vi.advanceTimersByTime(6 * 60 * 1000);
    await getModelPricingMap();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty object when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { getModelPricingMap } = await import("../model-pricing");
    const map = await getModelPricingMap();
    expect(map).toEqual({});
  });

  it("returns an empty object when the fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const { getModelPricingMap } = await import("../model-pricing");
    const map = await getModelPricingMap();
    expect(map).toEqual({});
  });

  it("returns cached data on error after TTL expires", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { [TEST_MODEL]: { input: 0.001, output: 0.002 } },
          }),
      })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { getModelPricingMap } = await import("../model-pricing");
    const map1 = await getModelPricingMap();
    expect(map1[TEST_MODEL]).toEqual({ input: 0.001, output: 0.002 });

    // Advance past TTL so next call tries to refetch
    vi.advanceTimersByTime(6 * 60 * 1000);
    await getModelPricingMap();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("isModelFree", () => {
  it("returns true when both input and output pricing are zero", async () => {
    const { isModelFree } = await import("../model-pricing");
    expect(isModelFree({ input: 0, output: 0 })).toBe(true);
  });

  it("returns false when either pricing value is non-zero", async () => {
    const { isModelFree } = await import("../model-pricing");
    expect(isModelFree({ input: 0, output: 0.001 })).toBe(false);
    expect(isModelFree({ input: 0.001, output: 0 })).toBe(false);
  });

  it("returns false when pricing is unavailable", async () => {
    const { isModelFree } = await import("../model-pricing");
    expect(isModelFree(null)).toBe(false);
    expect(isModelFree(undefined)).toBe(false);
  });
});

describe("calcApiCost", () => {
  it("returns null when pricing is null", async () => {
    const { calcApiCost } = await import("../model-pricing");
    expect(calcApiCost(null, 100, 100)).toBe(null);
  });

  it("returns null when pricing is undefined", async () => {
    const { calcApiCost } = await import("../model-pricing");
    expect(calcApiCost(undefined, 100, 100)).toBe(null);
  });

  it("calculates the total cost", async () => {
    const { calcApiCost } = await import("../model-pricing");
    expect(calcApiCost({ input: 0.001, output: 0.002 }, 1000, 500)).toBe(
      0.001 * 1000 + 0.002 * 500,
    );
  });

  it("returns null when the result is not finite", async () => {
    const { calcApiCost } = await import("../model-pricing");
    const pricing = { input: Number.NaN, output: 0 };
    expect(calcApiCost(pricing, 100, 100)).toBe(null);
  });

  it("handles zero tokens", async () => {
    const { calcApiCost } = await import("../model-pricing");
    expect(calcApiCost({ input: 0.001, output: 0.002 }, 0, 0)).toBe(0);
  });
});
