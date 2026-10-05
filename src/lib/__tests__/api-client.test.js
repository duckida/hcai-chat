import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateTitle,
  getErrorMessage,
  getStoredApiKey,
  setStoredApiKey,
  streamChatCompletion,
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
    await streamChatCompletion({
      messages: [],
      model: "model",
      onChunk: vi.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("surfaces a plain-text proxy error instead of a JSON parse crash", async () => {
    // route.js only ever returns JSON, so a body of bare "Bad Gateway" is a
    // proxy in front of the app (finding 16). response.json() on it threw a
    // SyntaxError, and that SyntaxError became the user-facing "API Error".
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "Bad Gateway",
    });
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
    });

    // First attempt fails → one retry → fails the same way → the error.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const message = onError.mock.calls[0][0].message;
    expect(message).toContain("502");
    expect(message).toContain("Bad Gateway");
    expect(message).not.toContain("Unexpected token");
  });

  it("unwraps a JSON error body from a failed request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({ error: "context too large" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
    });

    expect(onError.mock.calls[0][0].message).toBe("context too large");
  });

  it("POSTs to /api/chat with the right body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const messages = [{ role: "user", content: "hi" }];
    await streamChatCompletion({
      messages,
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
    });

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

  it("strips error placeholders and empty assistant records from the POSTed messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const messages = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "",
        error: { title: "API Error", details: "boom" },
      },
      { role: "assistant", content: "" },
      { role: "user", content: "still here" },
    ];
    await streamChatCompletion({
      messages,
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "still here" },
    ]);
  });

  it("uses the sanitized messages for the streamed retry too", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: "stream failed" }),
        json: async () => ({ error: "stream failed" }),
      })
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"recovered ok"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onChunk = vi.fn();
    const messages = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "",
        error: { title: "API Error", details: "boom" },
      },
    ];
    await streamChatCompletion({
      messages,
      model: TEST_MODEL,
      onChunk,
      onError: vi.fn(),
    });

    expect(onChunk).toHaveBeenCalledWith("recovered ok", "content");
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.messages).toEqual([{ role: "user", content: "hi" }]);
    // The retry streams — a silent JSON request for a long answer is what a
    // proxy read-timeout kills (finding 16).
    expect(retryBody.stream).toBe(true);
  });

  it("continues from the partial after a mid-stream reset, with no replay clear", async () => {
    let streamedCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      JSON.parse(opts.body);
      streamedCalls += 1;
      if (streamedCalls === 1) {
        // A proxy mid-stream reset: the fetch "succeeds" but the body throws
        // partway through, leaving the client with a partial answer.
        return Promise.resolve({
          ok: true,
          status: 200,
          body: {
            getReader: () => {
              let i = 0;
              const frames = [
                'data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\n',
                "BROKEN",
              ];
              return {
                read: () => {
                  i++;
                  if (i === 1) {
                    return Promise.resolve({
                      done: false,
                      value: new TextEncoder().encode(frames[0]),
                    });
                  }
                  return Promise.reject(new Error("network reset"));
                },
              };
            },
          },
        });
      }
      return Promise.resolve(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"Full answer, complete"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const onFallbackStart = vi.fn();
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError,
      onComplete,
      onFallbackStart,
    });

    // The partial is what the next request continues, so it must stay on
    // screen — a replay clear here would flash the answer away (finding 17).
    expect(onFallbackStart).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const legBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(legBody.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Partial answer" },
      {
        role: "user",
        content: expect.stringContaining("Continue it exactly where it stopped"),
      },
    ]);
    expect(onChunk).toHaveBeenNthCalledWith(1, "Partial answer", "content");
    expect(onChunk).toHaveBeenNthCalledWith(
      2,
      "Full answer, complete",
      "content",
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("forwards content chunks via onChunk", async () => {
    const lines = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onChunk = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk,
      onError: vi.fn(),
    });
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
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk,
      onError: vi.fn(),
      thinking: true,
    });
    expect(onChunk).toHaveBeenCalledWith("hmm", "thinking");
  });

  it("handles usage events from the server", async () => {
    const lines = [
      `data: {"type":"usage","usage":{"model":"${TEST_MODEL}","inputTokens":1,"outputTokens":2,"totalTokens":3,"duration":0.1,"tokensPerSecond":20,"cost":0.0001}}\n\n`,
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onMetrics = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      onMetrics,
    });
    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        model: TEST_MODEL,
        inputTokens: 1,
        outputTokens: 2,
      }),
    );
  });

  it("handles error events from the server", async () => {
    const lines = [
      'data: {"type":"error","error":"Oops"}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onError = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
    });
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
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      onSearchResult,
    });
    expect(onSearchResult).toHaveBeenCalledWith([{ url: "https://a" }], "text");
  });

  it("forwards sandbox_result events", async () => {
    const lines = [
      'data: {"type":"sandbox_result","tool":"execute_code","code":"1+1","stdout":"2","stderr":"","exitCode":0,"sandboxId":"sbx"}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onSandboxResult = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      onSandboxResult,
    });
    expect(onSandboxResult).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "execute_code",
        sandboxId: "sbx",
        exitCode: 0,
      }),
    );
  });

  it("forwards tool calls", async () => {
    const lines = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"abc","function":{"name":"web_search","arguments":"{\\"q\\""}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeStreamResponse(lines)));

    const onToolCall = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      tools: [{ type: "function", function: { name: "web_search" } }],
      toolChoice: "auto",
      onToolCall,
    });
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
      vi.fn().mockResolvedValue(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"done"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const onComplete = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      onComplete,
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it("retries with a fresh streamed request when nothing was delivered", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeStreamResponse(["data: [DONE]\n\n"]))
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onChunk = vi.fn();
    const onFallbackStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError,
      onComplete,
      onFallbackStart,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).stream).toBe(true);
    expect(onFallbackStart).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith("recovered", "content");
    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not retry a stream that delivered thinking", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeStreamResponse([
        'data: {"choices":[{"delta":{"thinking":"hmm"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onComplete = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      onComplete,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalled();
  });

  it("does not retry after a server error event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeStreamResponse([
        'data: {"type":"error","error":"Oops"}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("Oops");
  });

  it("does not retry after a server-side tool result was delivered", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeStreamResponse([
        'data: {"type":"sandbox_result","tool":"execute_code","code":"1+1","stdout":"2","stderr":"","exitCode":0,"sandboxId":"sbx"}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onSandboxResult = vi.fn();
    const onComplete = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      onSandboxResult,
      onComplete,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSandboxResult).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalled();
  });

  it("continues a stream that delivered content but never sent [DONE]", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"half an ans"}}]}\n\n',
          // Connection cut mid-answer: the stream ends with no [DONE].
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"wer, finished"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onChunk = vi.fn();
    const onFallbackStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError,
      onComplete,
      onFallbackStart,
    });

    // The continuation asks for the remainder — same history, the partial as
    // the assistant's turn, and the continue instruction. The partial is
    // never re-generated (a full replay under a deterministic cap dies at the
    // same length again — finding 17), so nothing clears what's on screen.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const legBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(legBody.stream).toBe(true);
    expect(legBody.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "half an ans" },
      {
        role: "user",
        content: expect.stringContaining("Continue it exactly where it stopped"),
      },
    ]);
    expect(onFallbackStart).not.toHaveBeenCalled();
    const contentCalls = onChunk.mock.calls.filter((c) => c[1] === "content");
    expect(contentCalls).toEqual([
      ["half an ans", "content"],
      ["wer, finished", "content"],
    ]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps continuing a repeatedly cut stream only up to the leg budget", async () => {
    // Every request delivers text and dies without [DONE], so every request
    // looks recoverable. The budget is what stops that: one attempt plus
    // MAX_CONTINUE_LEGS legs (4 calls), then an error card the caller
    // commits the accumulated partial alongside.
    const fetchMock = vi.fn().mockImplementation(() =>
      makeStreamResponse([
        'data: {"choices":[{"delta":{"content":"chop"}}]}\n\n',
        // Every attempt ends with content and no [DONE].
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    const onComplete = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
      onComplete,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain("cut off");
    expect(onError.mock.calls[0][0].message).toContain(TEST_MODEL);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("reports an error when the retry also delivers nothing", async () => {
    // The empty ending can no longer reach onComplete: with the first
    // attempt's partial still buffered, that would silently commit a
    // truncated answer as if it were whole.
    const fetchMock = vi
      .fn()
      .mockImplementation(() => makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    const onComplete = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
      onComplete,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain(
      `No response received from model "${TEST_MODEL}"`,
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not replay a stream that completed with [DONE]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeStreamResponse([
        'data: {"choices":[{"delta":{"content":"done"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onComplete = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      onComplete,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not replay after a server error event that arrived without [DONE]", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeStreamResponse(['data: {"type":"error","error":"Oops"}\n\n']),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onError = vi.fn();
    const onComplete = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
      onComplete,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("Oops");
  });

  it("continues after a tool result that arrived without [DONE]", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"type":"search_result","sources":["https://example.org/a"],"content":"found"}\n\n',
          // Connection dies after the tool result: no [DONE].
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"and here is the answer"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onSearchResult = vi.fn();
    const onFallbackStart = vi.fn();
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk,
      onError,
      onSearchResult,
      onComplete,
      onFallbackStart,
    });

    // The search already ran and its result is on screen. Continuing asks
    // for the answer without re-running the tool — and without the replay
    // clear that would have discarded the sources (finding 17: this turn
    // used to complete silently with only the tool's own content).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const legBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    // No content was delivered yet, so there is no partial to anchor to.
    expect(legBody.messages).toEqual([
      {
        role: "user",
        content: expect.stringContaining("Continue it exactly where it stopped"),
      },
    ]);
    expect(onFallbackStart).not.toHaveBeenCalled();
    expect(onSearchResult).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith("and here is the answer", "content");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  // ---- continuation mechanics ---------------------------------------------

  it("continues a thinking-only stream with its reasoning attached", async () => {
    // Thinking without the [DONE] marker is still a partial: the continuation
    // sends the interrupted reasoning back so the model resumes where it
    // stopped thinking rather than restarting the turn.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"thinking":"hmm"}}]}\n\n',
          // Cut after thinking, no [DONE].
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"thinking":"still thinking"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onFallbackStart = vi.fn();
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError,
      onComplete,
      onFallbackStart,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const continueBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    // The continuation replays original messages + the interrupted assistant
    // turn carrying its reasoning_details, not a fresh replay.
    expect(continueBody.messages).toHaveLength(3);
    expect(continueBody.messages[0]).toEqual({ role: "user", content: "hi" });
    expect(continueBody.messages[1]).toMatchObject({ role: "assistant" });
    expect(continueBody.messages[1].reasoning_details).toEqual([
      { type: "reasoning.text", text: "hmm" },
    ]);
    expect(continueBody.messages[2].role).toBe("user");
    expect(onFallbackStart).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith("hmm", "thinking");
    expect(onChunk).toHaveBeenCalledWith("still thinking", "thinking");
    expect(onChunk).toHaveBeenCalledWith("answer", "content");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("continues an empty leg again, then reports no response", async () => {
    // Product decision: a continuation that delivers nothing is continued
    // again rather than failing outright — but only up to MAX_EMPTY_LEGS
    // consecutive empties, so a dead endpoint cannot spin.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"starts the answer"}}]}\n\n',
          // Cut after the first delta, no [DONE].
        ]),
      )
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const onChunk = vi.fn();
    const onFallbackStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError,
      onComplete,
      onFallbackStart,
    });

    // One attempt + two legs that each end with a bare [DONE] (delivered
    // nothing) — the second empty is the budget, not a third request.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onFallbackStart).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain(
      `No response received from model "${TEST_MODEL}"`,
    );
    // The partial survives to the error commit; it was never cleared.
    expect(onChunk).toHaveBeenCalledWith("starts the answer", "content");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("continues again after a leg dies before delivering anything", async () => {
    // A transport failure on a continuation is the same as an empty leg:
    // keep going, and recover when a later leg works. The thrown error only
    // surfaces if every leg that could have replaced it also fails.
    let streamed = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      streamed += 1;
      if (streamed === 1) {
        return Promise.resolve(
          makeStreamResponse([
            'data: {"choices":[{"delta":{"content":"started"}}]}\n\n',
            // Cut, no [DONE].
          ]),
        );
      }
      if (streamed === 2) {
        return Promise.reject(new Error("proxy hiccup"));
      }
      return Promise.resolve(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":" and finished."}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const onFallbackStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError,
      onComplete,
      onFallbackStart,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
    expect(onFallbackStart).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("trims a tail the continuation repeats instead of showing it twice", async () => {
    // A model that ignores the instruction and restarts from the sentence it
    // was shown must lose the repetition, not the answer: the overlap
    // against the partial is dropped once, at the seam.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"Answer: it is definitely fine. "}}]}\n\n',
          // Cut, no [DONE].
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"definitely fine. And here is why."}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onChunk = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError: vi.fn(),
      onComplete: vi.fn(),
    });

    const content = onChunk.mock.calls
      .filter((c) => c[1] === "content")
      .map((c) => c[0])
      .join("");
    expect(content).toBe("Answer: it is definitely fine. And here is why.");
  });

  it("continues from the replay's partial when the replay is cut", async () => {
    // The first attempt delivered nothing, so it earns the one whole-answer
    // replay. When that replay is cut too, regenerating a third time is
    // exactly what finding 17 forbids — the replay's partial continues.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeStreamResponse(["data: [DONE]\n\n"]))
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":"the replay got this far"}}]}\n\n',
          // Replay cut, no [DONE].
        ]),
      )
      .mockResolvedValueOnce(
        makeStreamResponse([
          'data: {"choices":[{"delta":{"content":" and then continued."}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onChunk = vi.fn();
    const onFallbackStart = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError,
      onComplete,
      onFallbackStart,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Only the replay clears — the continuation appends over what it left.
    expect(onFallbackStart).toHaveBeenCalledTimes(1);
    const legBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(legBody.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "the replay got this far" },
      {
        role: "user",
        content: expect.stringContaining("Continue it exactly where it stopped"),
      },
    ]);
    const content = onChunk.mock.calls
      .filter((c) => c[1] === "content")
      .map((c) => c[0]);
    expect(content).toEqual([
      "the replay got this far",
      " and then continued.",
    ]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("cancels a stalled read after the silence timeout and replays", async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      let readCount = 0;
      let resolveHang;
      const hang = new Promise((resolve) => {
        resolveHang = resolve;
      });
      const cancel = vi.fn(() => {
        resolveHang({ done: true, value: undefined });
        return Promise.resolve();
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: vi.fn(() => {
                readCount += 1;
                if (readCount === 1) {
                  return Promise.resolve({
                    done: false,
                    value: encoder.encode(
                      'data: {"choices":[{"delta":{"content":"partial "}}]}\n\n',
                    ),
                  });
                }
                // Wedged: this read never settles on its own.
                return hang;
              }),
              cancel,
            }),
          },
        })
        .mockResolvedValueOnce(
          makeStreamResponse([
            'data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        );
      vi.stubGlobal("fetch", fetchMock);

      const onChunk = vi.fn();
      const promise = streamChatCompletion({
        messages: [],
        model: TEST_MODEL,
        onChunk,
        onError: vi.fn(),
        onComplete: vi.fn(),
      });

      // The server keepalives every 5s, so silence past the 60s tolerance is
      // a dead connection, not a slow model.
      await vi.advanceTimersByTimeAsync(60_000);
      await promise;

      expect(cancel).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).stream).toBe(true);
      expect(onChunk).toHaveBeenCalledWith("recovered", "content");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a stale read when the tab becomes visible again", async () => {
    // Only Date is faked: the stall timer must stay asleep so this can only
    // pass on the visibility branch, not on the timeout it exists to cover
    // (a background tab throttles its timers to once a minute or worse).
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const encoder = new TextEncoder();
      let readCount = 0;
      let resolveHang;
      const hang = new Promise((resolve) => {
        resolveHang = resolve;
      });
      const cancel = vi.fn(() => {
        resolveHang({ done: true, value: undefined });
        return Promise.resolve();
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: vi.fn(() => {
                readCount += 1;
                if (readCount === 1) {
                  return Promise.resolve({
                    done: false,
                    value: encoder.encode(
                      'data: {"choices":[{"delta":{"content":"partial "}}]}\n\n',
                    ),
                  });
                }
                return hang;
              }),
              cancel,
            }),
          },
        })
        .mockResolvedValueOnce(
          makeStreamResponse([
            'data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        );
      vi.stubGlobal("fetch", fetchMock);

      const onChunk = vi.fn();
      const promise = streamChatCompletion({
        messages: [],
        model: TEST_MODEL,
        onChunk,
        onError: vi.fn(),
        onComplete: vi.fn(),
      });
      // Let the fetch and the first read settle so the loop is parked on the
      // second (hanging) read before the tab "returns".
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Advance past the 60s stall tolerance to simulate a tab that was
      // backgrounded long enough that the connection is considered stale.
      vi.setSystemTime(Date.now() + 61_000);
      document.dispatchEvent(new Event("visibilitychange"));
      await promise;

      expect(cancel).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).stream).toBe(true);
      expect(onChunk).toHaveBeenCalledWith("recovered", "content");
    } finally {
      vi.useRealTimers();
    }
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
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk,
      onError,
    });
    expect(onChunk).toHaveBeenCalledWith("ok", "content");
  });

  it("includes tools and tool_choice in the body when tools are provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    const tools = [{ type: "function", function: { name: "x" } }];
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      tools,
      toolChoice: "required",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe("required");
  });

  it("forwards agent-mode fields only when agentMode is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      agentMode: true,
      conversationId: "conv-1",
      e2bApiKey: "e2b-key",
      sandboxId: "sbx-1",
      onSandboxResult: vi.fn(),
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.agentMode).toBe(true);
    expect(body.conversationId).toBe("conv-1");
    expect(body.e2bApiKey).toBe("e2b-key");
    expect(body.sandboxId).toBe("sbx-1");
  });

  it("omits agent-mode fields when agentMode is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("agentMode");
    expect(body).not.toHaveProperty("conversationId");
  });

  it("includes max_tokens when provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);
    await streamChatCompletion({
      messages: [],
      model: TEST_MODEL,
      onChunk: vi.fn(),
      onError: vi.fn(),
      maxTokens: 4096,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(4096);
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
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '"Quick title"' } }],
          }),
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
