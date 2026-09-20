import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "../route";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe("/api/pricing GET", () => {
  it("returns pricing map for all models", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: "google/gemini-3.1-flash-lite",
              pricing: { prompt: "0.0001", completion: "0.0002" },
            },
            {
              id: "other-model",
              pricing: { prompt: "0.001", completion: "0.002" },
            },
            {
              id: "no-pricing",
            },
            {
              id: "bad-pricing",
              pricing: { prompt: "free", completion: "free" },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data["google/gemini-3.1-flash-lite"]).toEqual({
      input: 0.0001,
      output: 0.0002,
    });
    expect(data.data["other-model"]).toEqual({
      input: 0.001,
      output: 0.002,
    });
    expect(data.data["no-pricing"]).toBeUndefined();
    expect(data.data["bad-pricing"]).toBeUndefined();
  });

  it("handles the response being an array (no `data` wrapper)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "google/gemini-3.1-flash-lite",
              pricing: { prompt: "0.0001", completion: "0.0002" },
            },
          ]),
      }),
    );
    const res = await GET();
    const data = await res.json();
    expect(data.data).toBeDefined();
    expect(data.data["google/gemini-3.1-flash-lite"]).toEqual({
      input: 0.0001,
      output: 0.0002,
    });
  });

  it("returns 5xx on fetch failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns the upstream status code on non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: "Bad Gateway" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns CORS headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

describe("/api/pricing OPTIONS", () => {
  it("responds with CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
