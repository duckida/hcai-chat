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

  it("uses the sanitized messages for the non-streaming fallback too", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "stream failed" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: "fallback ok" }),
      });
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

    expect(onChunk).toHaveBeenCalledWith("fallback ok", "content");
    const fallbackBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fallbackBody.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("fires onFallbackStart before replaying the regenerated text", async () => {
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      const parsed = JSON.parse(opts.body);
      if (parsed.stream) {
        // A proxy mid-stream abort: the fetch "succeeds" but the body throws
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
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ text: "Full answer, complete" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onFallbackStart = vi.fn();
    const onChunk = vi.fn();
    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      model: TEST_MODEL,
      onChunk,
      onError: vi.fn(),
      onFallbackStart,
    });

    expect(onFallbackStart).toHaveBeenCalledTimes(1);
    // The discard must happen before the regenerated text is replayed.
    expect(onChunk.mock.invocationCallOrder[0]).toBeLessThan(
      onChunk.mock.invocationCallOrder[1],
    );
    const fallbackOrder = onFallbackStart.mock.invocationCallOrder[0];
    const replayedAt =
      onChunk.mock.invocationCallOrder.find(
        (order) =>
          onChunk.mock.calls[onChunk.mock.invocationCallOrder.indexOf(order)]?.[0] ===
          "Full answer, complete",
      );
    expect(replayedAt).toBeGreaterThan(fallbackOrder);

    expect(onChunk).toHaveBeenCalledWith("Partial answer", "content");
    expect(onChunk).toHaveBeenCalledWith("Full answer, complete", "content");
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

  it("retries non-streaming when the stream ends without delivering anything", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeStreamResponse(["data: [DONE]\n\n"]))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: "recovered" }),
      });
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
