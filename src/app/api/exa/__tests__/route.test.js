import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const makeReq = (body) => ({
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/exa POST", () => {
  it("returns 400 for invalid endpoint", async () => {
    const res = await POST(
      makeReq({ endpoint: "bogus", apiKey: "k", data: {} }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when apiKey is missing", async () => {
    const res = await POST(
      makeReq({ endpoint: "search", apiKey: "", data: { query: "x" } }),
    );
    expect(res.status).toBe(401);
  });

  it("proxies a successful JSON request and forwards the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ url: "https://a" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      makeReq({
        endpoint: "search",
        apiKey: "k",
        data: { query: "x" },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toEqual([{ url: "https://a" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai.hackclub.com/proxy/v1/exa/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer k",
        }),
      }),
    );
  });

  it("forwards JSON error responses with the upstream status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ error: "Unauthorized" }),
        text: () => Promise.resolve(""),
      }),
    );
    const res = await POST(
      makeReq({ endpoint: "search", apiKey: "k", data: {} }),
    );
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("wraps non-JSON error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => "text/html" },
        text: () => Promise.resolve("Internal Server Error"),
        json: () => Promise.reject(new Error("not json")),
      }),
    );
    const res = await POST(
      makeReq({ endpoint: "search", apiKey: "k", data: {} }),
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Internal Server Error");
  });

  it("falls back to status text when error response cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers({ "content-type": "text/html" }),
        text: () => Promise.resolve(""), // simulate empty body
      }),
    );
    const req = new Request("http://localhost/api/exa", {
      method: "POST",
      body: JSON.stringify({
        endpoint: "search",
        apiKey: "test-key",
        data: { query: "hello" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("HTTP error 503");
  });

  it("passes through the streaming response for the answer endpoint", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: hi\n\n"));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body,
        json: () => Promise.resolve({}),
      }),
    );

    const res = await POST(
      makeReq({
        endpoint: "answer",
        apiKey: "k",
        data: { query: "x" },
        stream: true,
      }),
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("does not stream the answer endpoint when stream flag is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ answer: "ok" }),
      }),
    );
    const res = await POST(
      makeReq({
        endpoint: "answer",
        apiKey: "k",
        data: { query: "x" },
        stream: false,
      }),
    );
    expect(res.headers.get("Content-Type")).not.toBe("text/event-stream");
  });

  it("returns 500 if the body parse fails", async () => {
    const res = await POST({
      json: () => Promise.reject(new Error("bad")),
    });
    expect(res.status).toBe(500);
  });
});
