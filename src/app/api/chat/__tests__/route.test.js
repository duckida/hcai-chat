import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const TEST_MODEL = "google/gemini-3.1-flash-lite";

// Mock the upstream SDK modules so we don't actually call the AI provider
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => {
    const fn = (model) => ({
      modelId: model,
      // a sentinel value to compare against
    });
    return fn;
  }),
}));

vi.mock("ai", async () => {
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    tool: vi.fn((config) => config),
    jsonSchema: vi.fn((s) => s),

  };
});

const makeReq = (body) => ({
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/chat POST", () => {
  it("returns 400 if JSON is invalid", async () => {
    const req = { json: () => Promise.reject(new Error("bad json")) };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns JSON when stream is false", async () => {
    const { generateText } = await import("ai");
    generateText.mockResolvedValue({
      text: "Hi there",
      finishReason: "stop",
    });

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "key",
        stream: false,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe("Hi there");
    expect(data.finishReason).toBe("stop");
  });

  it("appends artifact instructions to system prompt when artifacts=true", async () => {
    const { generateText } = await import("ai");
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        artifacts: true,
        stream: false,
      }),
    );
    const call = generateText.mock.calls[0][0];
    expect(call.system).toMatch(/Artifact Mode/);
  });

  it("does not include artifact instructions when artifacts=false", async () => {
    const { generateText } = await import("ai");
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        artifacts: false,
        stream: false,
      }),
    );
    const call = generateText.mock.calls[0][0];
    expect(call.system).not.toMatch(/Artifact Mode/);
  });

  it("passes maxTokens to generateText when provided", async () => {
    const { generateText } = await import("ai");
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
        max_tokens: 1024,
      }),
    );
    const call = generateText.mock.calls[0][0];
    expect(call.maxTokens).toBe(1024);
  });

  it("uses the openrouter provider with the right baseUrl", async () => {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const { generateText } = await import("ai");
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
      }),
    );
    expect(createOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "k",
        baseUrl: "https://ai.hackclub.com/proxy/v1",
      }),
    );
  });

  it("sets reasoning options based on `think` flag", async () => {
    const { generateText } = await import("ai");
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
        think: true,
      }),
    );
    const call = generateText.mock.calls[0][0];
    expect(call.providerOptions.openrouter.include_reasoning).toBe(true);

    generateText.mockClear();
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
        think: false,
      }),
    );
    const call2 = generateText.mock.calls[0][0];
    expect(call2.providerOptions.openrouter.include_reasoning).toBe(false);
  });

  it("converts clientTools to SDK tools", async () => {
    const { generateText, tool, jsonSchema } = await import("ai");
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
        tools: [
          {
            type: "function",
            function: {
              name: "javascript_calculator",
              description: "calc",
              parameters: { type: "object", properties: { expression: { type: "string" } } },
            },
          },
        ],
      }),
    );
    const call = generateText.mock.calls[0][0];
    expect(call.tools).toHaveProperty("javascript_calculator");
    expect(tool).toHaveBeenCalled();
    expect(jsonSchema).toHaveBeenCalled();
  });

  it("filters out malformed client tools", async () => {
    const { generateText } = await import("ai");
    generateText.mockResolvedValue({ text: "ok", finishReason: "stop" });
    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
        tools: [
          { type: "function", function: { name: "ok_tool" } },
          { type: "not-a-function" },
          { type: "function" },
        ],
      }),
    );
    const call = generateText.mock.calls[0][0];
    expect(Object.keys(call.tools)).toEqual(["ok_tool"]);
  });

  it("returns a streaming response when stream is not false", async () => {
    const { streamText } = await import("ai");
    streamText.mockReturnValue({
      fullStream: (async function* () {
        // no events
      })(),
      usage: Promise.resolve({ promptTokens: 1, completionTokens: 2 }),
    });

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        // stream is undefined -> default streaming path
      }),
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    // Consume the stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let chunks = "";
    // Read until done
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks += decoder.decode(value);
    }
    // The stream should end with [DONE]
    expect(chunks).toContain("data: [DONE]");
  });

  it("emits a text-delta event as a content chunk", async () => {
    const { streamText } = await import("ai");
    streamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "Hello" };
        yield { type: "text-delta", text: " world" };
        yield {
          type: "finish",
          usage: { promptTokens: 1, completionTokens: 2 },
          providerMetadata: {},
        };
      })(),
      usage: Promise.resolve({ promptTokens: 1, completionTokens: 2 }),
    });

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value);
    }
    expect(out).toContain('"content":"Hello"');
    expect(out).toContain('"content":" world"');
  });

  it("emits a reasoning-delta event as a thinking chunk", async () => {
    const { streamText } = await import("ai");
    streamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "reasoning-delta", text: "hmm" };
        yield {
          type: "finish",
          usage: { promptTokens: 1, completionTokens: 1 },
          providerMetadata: {},
        };
      })(),
      usage: Promise.resolve({ promptTokens: 1, completionTokens: 1 }),
    });

    const res = await POST(makeReq({ model: TEST_MODEL, messages: [{ role: "user", content: "hi" }], apiKey: "k" }));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value);
    }
    expect(out).toContain('"thinking":"hmm"');
  });

  it("emits tool-input-start, tool-input-delta, and tool-call events", async () => {
    const { streamText } = await import("ai");
    streamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "tool-input-start", id: "id1", toolName: "web_search" };
        yield { type: "tool-input-delta", id: "id1", delta: '{"q":' };
        yield { type: "tool-input-delta", id: "id1", delta: '"hi"}' };
        yield {
          type: "tool-call",
          toolCallId: "id1",
          toolName: "web_search",
          input: { q: "hi" },
        };
        yield {
          type: "tool-result",
          toolCallId: "id1",
          toolName: "web_search",
          output: { answer: "answer", citations: [] },
        };
        yield {
          type: "finish",
          usage: { promptTokens: 1, completionTokens: 1 },
          providerMetadata: {},
        };
      })(),
      usage: Promise.resolve({ promptTokens: 1, completionTokens: 1 }),
    });

    const res = await POST(makeReq({ model: TEST_MODEL, messages: [{ role: "user", content: "hi" }], apiKey: "k" }));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value);
    }
    expect(out).toContain('"name":"web_search"');
    expect(out).toContain('"search_result"');
    expect(out).toContain('"content":"answer"');
  });

  it("emits a usage event before [DONE]", async () => {
    const { streamText } = await import("ai");
    streamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "x" };
        yield {
          type: "finish",
          usage: { promptTokens: 5, completionTokens: 7 },
          providerMetadata: {
            openrouter: { usage: { cost: 0.001 } },
          },
        };
      })(),
      usage: Promise.resolve({ promptTokens: 5, completionTokens: 7 }),
    });

    const res = await POST(makeReq({ model: TEST_MODEL, messages: [{ role: "user", content: "hi" }], apiKey: "k" }));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value);
    }
    expect(out).toContain('"type":"usage"');
    expect(out).toContain('"inputTokens":5');
    expect(out).toContain('"outputTokens":7');
    expect(out).toContain('"cost":0.001');
  });

  it("emits an error event and closes the stream on failure", async () => {
    const { streamText } = await import("ai");
    streamText.mockReturnValue({
      fullStream: (async function* () {
        throw new Error("stream boom");
      })(),
      usage: Promise.resolve({ promptTokens: 0, completionTokens: 0 }),
    });

    const res = await POST(makeReq({ model: TEST_MODEL, messages: [{ role: "user", content: "hi" }], apiKey: "k" }));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value);
    }
    expect(out).toContain('"type":"error"');
    expect(out).toContain("stream boom");
  });

  it("excludes tool call time from generation duration and tokensPerSecond", async () => {
    const { streamText } = await import("ai");

    // Simulate a stream where text-delta events are tightly grouped, but a
    // long tool execution sits between them. Real wall-clock time spent on
    // the tool should be reflected in `duration` but NOT in the
    // `generationDuration` used for tokensPerSecond.
    const startMs = 1_700_000_000_000;
    const timeline = {
      // stream begin (startTime)
      0: startMs,
      // first text-delta
      1: startMs + 10,
      // second text-delta after a long tool execution
      2: startMs + 2000,
      // stream end (endTime)
      3: startMs + 2050,
    };
    let tick = 0;
    const dateSpy = vi
      .spyOn(Date, "now")
      .mockImplementation(() => timeline[tick++] ?? startMs + 2050);

    streamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "Hello" };
        yield { type: "tool-input-start", id: "t1", toolName: "web_search" };
        yield { type: "tool-input-delta", id: "t1", delta: '{"q":' };
        yield {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "web_search",
          input: { q: "x" },
        };
        yield {
          type: "tool-result",
          toolCallId: "t1",
          toolName: "web_search",
          output: { answer: "ok", citations: [] },
        };
        yield { type: "text-delta", text: " world" };
        yield {
          type: "finish",
          usage: { promptTokens: 5, completionTokens: 10 },
          providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
        };
      })(),
      usage: Promise.resolve({ promptTokens: 5, completionTokens: 10 }),
    });

    try {
      const res = await POST(
        makeReq({
          model: TEST_MODEL,
          messages: [{ role: "user", content: "hi" }],
          apiKey: "k",
          tools: [
            {
              type: "function",
              function: {
                name: "web_search",
                description: "search",
                parameters: {
                  type: "object",
                  properties: { q: { type: "string" } },
                },
              },
            },
          ],
        }),
      );
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let out = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        out += decoder.decode(value);
      }

      const usageMatch = out.match(/"type":"usage","usage":(\{[^}]+\})/);
      expect(usageMatch).toBeTruthy();
      const usage = JSON.parse(usageMatch[1]);

      // Wall-clock duration spans the entire stream (~2050ms = 2.05s)
      expect(usage.duration).toBeCloseTo(2.05, 5);
      // Generation duration only counts the active text windows
      // (10ms -> 2000ms = 1990ms ≈ 1.99s)
      expect(usage.generationDuration).toBeCloseTo(1.99, 5);
      // tokensPerSecond is based on the active generation window, not wall clock
      // 10 tokens / 1.99s ≈ 5.03 t/s
      expect(usage.tokensPerSecond).toBe(5.03);
    } finally {
      dateSpy.mockRestore();
    }
  });
});
