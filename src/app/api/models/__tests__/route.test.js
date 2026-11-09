import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

// The route keeps a module-level cache. Re-importing the module per test is
// what gives each case a clean cache without exporting a test-only hook.
let GET;
let OPTIONS;

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  ({ GET, OPTIONS } = await import("../route"));
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe("/api/models GET", () => {
  it("returns text-only models trimmed to the fields the client reads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: "google/gemini-3.1-flash-lite",
              name: "Google: Gemini 3.1 Flash Lite",
              context_length: 1048576,
              supported_parameters: ["tools"],
              reasoning: { supported_efforts: ["low", "high"] },
              description: "a long description the client never reads",
              architecture: { output_modalities: ["text"] },
              endpoints: [{ provider: "google", pricing: {} }],
            },
            {
              id: "multimodal",
              architecture: { output_modalities: ["text", "image"] },
            },
            {
              id: "image-only",
              architecture: { output_modalities: ["image"] },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual([
      {
        id: "google/gemini-3.1-flash-lite",
        name: "Google: Gemini 3.1 Flash Lite",
        context_length: 1048576,
        supported_parameters: ["tools"],
        reasoning: { supported_efforts: ["low", "high"] },
      },
    ]);
  });

  it("normalizes a bare array response into a `data` wrapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "google/gemini-3.1-flash-lite",
              name: "Gemini",
              architecture: { output_modalities: ["text"] },
            },
            {
              id: "image-only",
              architecture: { output_modalities: ["image"] },
            },
          ]),
      }),
    );

    const res = await GET();
    const data = await res.json();
    // The old code assigned `.data` to the array itself, which JSON
    // serialization dropped — the client then saw an empty catalog.
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBe("google/gemini-3.1-flash-lite");
  });

  it("reuses one upstream response for repeated requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: "google/gemini-3.1-flash-lite",
              architecture: { output_modalities: ["text"] },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await GET();
    await GET();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache an empty catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 5xx on fetch failure and does not cache it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports an upstream timeout as 504", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    const res = await GET();
    expect(res.status).toBe(504);
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

  it("returns CORS and cache headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: "google/gemini-3.1-flash-lite",
              architecture: { output_modalities: ["text"] },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });
});

describe("/api/models OPTIONS", () => {
  it("responds with CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
