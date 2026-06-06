import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exaAnswer,
  exaContents,
  exaFindSimilar,
  exaSearch,
  executeToolCall,
  generateTitle,
  getErrorMessage,
  getStoredApiKey,
  setStoredApiKey,
  streamChatCompletion,
  streamChatWithTools,
  streamExaAnswer,
} from "../api-client";

const TEST_MODEL = "google/gemini-3.1-flash-lite";
const STORAGE_KEY = "hack_club_ai_key";

const makeStreamResponse = (chunks) => {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: vi.fn(async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = encoder.encode(chunks[index]);
          index += 1;
          return { done: false, value };
        }),
      }),
    },
  };
};

describe("getErrorMessage", () => {
  it("returns default when input is falsy", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage(undefined, "fb")).toBe("fb");
  });

  it("unwraps error.message when error is an object", () => {
    expect(getErrorMessage({ error: { message: "boom" } }, "fb")).toBe("boom");
  });

  it("returns error string when error is a string", () => {
    expect(getErrorMessage({ error: "Bad" }, "fb")).toBe("Bad");
  });

  it("falls back to top-level message", () => {
    expect(getErrorMessage({ message: "Top" }, "fb")).toBe("Top");
  });

  it("returns default if no recognizable fields exist", () => {
    expect(getErrorMessage({ foo: "bar" }, "fb")).toBe("fb");
  });
});

describe("API key storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("getStoredApiKey returns null when no key is stored", () => {
    expect(getStoredApiKey()).toBe(null);
  });

  it("setStoredApiKey then getStoredApiKey returns the same value", () => {
    setStoredApiKey("secret-key");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("secret-key");
    expect(getStoredApiKey()).toBe("secret-key");
  });

  it("getStoredApiKey purges and returns null for non-stringified JSON keys", () => {
    localStorage.setItem(STORAGE_KEY, '{"some":"object"}');
    expect(getStoredApiKey()).toBe(null);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(null);
  });

  it("getStoredApiKey purges array-looking values", () => {
    localStorage.setItem(STORAGE_KEY, '["a","b"]');
    expect(getStoredApiKey()).toBe(null);
  });
});

describe("streamChatCompletion", () => {
  beforeEach(() => {
    localStorage.clear();
    setStoredApiKey("key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onError when no API key is set", async () => {
    localStorage.clear();
    const onError = vi.fn();
    await streamChatCompletion([], "model", vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("POSTs to /api/chat with the right body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const messages = [{ role: "user", content: "hi" }];
    await streamChatCompletion(messages, TEST_MODEL, vi.fn(), vi.fn());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(TEST_MODEL);
    expect(body.messages).toEqual(messages);
    expect(body.apiKey).toBe("key");
    expect(body.artifacts).toBe(false);
    expect(body.think).toBe(false);
  });

  it("forwards content chunks via onChunk", async () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onChunk = vi.fn();
    await streamChatCompletion([], TEST_MODEL, onChunk, vi.fn());
    expect(onChunk).toHaveBeenCalledWith("Hello", "content");
    expect(onChunk).toHaveBeenCalledWith(" world", "content");
  });

  it("forwards thinking tokens", async () => {
    const lines = [
      'data: {"choices":[{"delta":{"thinking":"hmm"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onChunk = vi.fn();
    await streamChatCompletion([], TEST_MODEL, onChunk, vi.fn(), null, true);
    expect(onChunk).toHaveBeenCalledWith("hmm", "thinking");
  });

  it("handles usage events from the server", async () => {
    const lines = [
      `data: {"type":"usage","usage":{"model":"${TEST_MODEL}","inputTokens":1,"outputTokens":2,"totalTokens":3,"duration":0.1,"tokensPerSecond":20,"cost":0.0001}}\n\n`,
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onMetrics = vi.fn();
    await streamChatCompletion([], TEST_MODEL, vi.fn(), vi.fn(), vi.fn(), false, false, null, "auto", null, null, onMetrics);
    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ model: TEST_MODEL, inputTokens: 1, outputTokens: 2 }),
    );
  });

  it("handles error events from the server", async () => {
    const lines = [
      'data: {"type":"error","error":"Oops"}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onError = vi.fn();
    await streamChatCompletion([], TEST_MODEL, vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe("Oops");
  });

  it("forwards search_result events", async () => {
    const lines = [
      'data: {"type":"search_result","sources":[{"url":"https://a"}],"content":"text"}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onSearchResult = vi.fn();
    await streamChatCompletion(
      [],
      TEST_MODEL,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      false,
      false,
      null,
      "auto",
      null,
      onSearchResult,
    );
    expect(onSearchResult).toHaveBeenCalledWith(
      [{ url: "https://a" }],
      "text",
    );
  });

  it("forwards tool calls", async () => {
    const lines = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"abc","function":{"name":"web_search","arguments":"{\\"q\\""}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onToolCall = vi.fn();
    await streamChatCompletion(
      [],
      TEST_MODEL,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      false,
      false,
      [{ type: "function", function: { name: "web_search" } }],
      "auto",
      onToolCall,
    );
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        id: "abc",
        name: "web_search",
        complete: true,
      }),
    );
  });

  it("calls onComplete when the stream finishes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"])),
    );
    const onComplete = vi.fn();
    await streamChatCompletion([], TEST_MODEL, vi.fn(), vi.fn(), onComplete);
    expect(onComplete).toHaveBeenCalled();
  });

  it("handles malformed JSON lines by ignoring them", async () => {
    const lines = [
      "data: not-json\n\n",
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onChunk = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion([], TEST_MODEL, onChunk, onError);
    expect(onChunk).toHaveBeenCalledWith("ok", "content");
  });

  it("includes tools and tool_choice in the body when tools are provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    const tools = [{ type: "function", function: { name: "x" } }];
    await streamChatCompletion(
      [],
      TEST_MODEL,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      false,
      false,
      tools,
      "required",
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe("required");
  });
});

describe("streamChatWithTools", () => {
  beforeEach(() => {
    localStorage.clear();
    setStoredApiKey("key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onError when no API key is set", async () => {
    localStorage.clear();
    const onError = vi.fn();
    await streamChatWithTools([], TEST_MODEL, vi.fn(), onError);
    expect(onError).toHaveBeenCalled();
  });

  it("decodes AI SDK stream part types 0/6/8/9", async () => {
    const lines = [
      '0:"hello"\n',
      '6:"thinking-now"\n',
      '8:{"toolCall":{"index":0,"toolCallId":"id1","toolName":"web_search","args":{"q":"hi"}}}\n',
      '9:{"toolCall":{"index":0,"toolCallId":"id1","toolName":""}}\n',
    ].join("");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeStreamResponse([lines])),
    );

    const onChunk = vi.fn();
    const onToolCall = vi.fn();
    await streamChatWithTools(
      [],
      TEST_MODEL,
      onChunk,
      vi.fn(),
      vi.fn(),
      false,
      false,
      null,
      "auto",
      onToolCall,
    );
    expect(onChunk).toHaveBeenCalledWith("hello", "content");
    expect(onChunk).toHaveBeenCalledWith("thinking-now", "thinking");
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ name: "web_search", complete: false }),
    );
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ complete: true }),
    );
  });
});

describe("generateTitle", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'New Chat' if no API key", async () => {
    expect(await generateTitle("hi")).toBe("New Chat");
  });

  it("returns the trimmed title from the response", async () => {
    setStoredApiKey("k");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: '"Quick title"' } }] }),
      }),
    );
    expect(await generateTitle("hi")).toBe("Quick title");
  });

  it("uses fallback truncation when response is malformed", async () => {
    setStoredApiKey("k");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateTitle(
      "a really really really long message that exceeds the limit",
    );
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(33);
  });
});

describe("Exa helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    setStoredApiKey("k");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exaSearch POSTs to /api/exa and returns JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const out = await exaSearch("query", { numResults: 3 });
    expect(out).toEqual({ results: [] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.endpoint).toBe("search");
    expect(body.data.numResults).toBe(3);
  });

  it("exaFindSimilar sends a url field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await exaFindSimilar("https://example.com");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.endpoint).toBe("findSimilar");
    expect(body.data.url).toBe("https://example.com");
  });

  it("exaContents wraps a single url in an array", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await exaContents("https://example.com");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.endpoint).toBe("contents");
    expect(body.data.urls).toEqual(["https://example.com"]);
  });

  it("exaAnswer returns the raw response when stream=false", async () => {
    const response = {
      ok: true,
      json: () => Promise.resolve({ answer: "42" }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const out = await exaAnswer("q", { stream: false });
    expect(out).toBe(response);
  });

  it("throws on non-OK responses with server error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Bad" }),
      }),
    );
    await expect(exaSearch("x")).rejects.toThrow("Bad");
  });

  it("calls onError when no API key", async () => {
    localStorage.clear();
    const onError = vi.fn();
    await streamExaAnswer("q", vi.fn(), onError, vi.fn());
    expect(onError).toHaveBeenCalled();
  });

  it("streamExaAnswer streams content from SSE", async () => {
    const lines = [
      'data: {"answer":"a"}\n',
      'data: {"answer":"b"}\n',
      "data: [DONE]\n",
    ].join("");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeStreamResponse([lines])),
    );

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    await streamExaAnswer("q", onChunk, vi.fn(), onComplete);
    expect(onChunk).toHaveBeenCalledWith("a");
    expect(onChunk).toHaveBeenCalledWith("b");
  });
});

describe("executeToolCall", () => {
  beforeEach(() => {
    localStorage.clear();
    setStoredApiKey("k");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when no API key is present", async () => {
    localStorage.clear();
    await expect(executeToolCall("x", {})).rejects.toThrow(/API key/);
  });

  it("parses the JSON response on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (h) => (h === "content-type" ? "application/json" : null) },
        text: () => Promise.resolve(JSON.stringify({ result: "ok" })),
      }),
    );
    const out = await executeToolCall("web_search", { q: "hi" });
    expect(out).toEqual({ result: "ok" });
  });

  it("uses server error message on non-OK JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: (h) => (h === "content-type" ? "application/json" : null) },
        json: () => Promise.resolve({ error: "Bad" }),
        text: () => Promise.resolve(""),
      }),
    );
    await expect(executeToolCall("x", {})).rejects.toThrow("Bad");
  });

  it("uses status-based message when failure is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: { get: () => "text/plain" },
        text: () => Promise.resolve("Bad Gateway"),
        json: () => Promise.reject(new Error("not json")),
      }),
    );
    await expect(executeToolCall("x", {})).rejects.toThrow("Bad Gateway");
  });

  it("throws on non-JSON success response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: () => Promise.resolve("<html></html>"),
      }),
    );
    await expect(executeToolCall("x", {})).rejects.toThrow(/Invalid response type/);
  });

  it("throws on empty success body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve(""),
      }),
    );
    await expect(executeToolCall("x", {})).rejects.toThrow(/Empty response/);
  });

  it("throws on malformed JSON in success body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve("not json"),
      }),
    );
    await expect(executeToolCall("x", {})).rejects.toThrow(/Failed to parse/);
  });

  it("sends the API key in the request body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve("{}"),
      });
    vi.stubGlobal("fetch", fetchMock);
    await executeToolCall("x", { foo: 1 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tool).toBe("x");
    expect(body.parameters).toEqual({ foo: 1 });
    expect(body.apiKey).toBe("k");
  });

  it("accepts an explicit apiKey argument", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve("{}"),
      });
    vi.stubGlobal("fetch", fetchMock);
    await executeToolCall("x", {}, "explicit-key");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.apiKey).toBe("explicit-key");
  });
});
