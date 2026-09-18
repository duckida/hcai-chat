import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const TEST_MODEL = "google/gemini-3.1-flash-lite";

// Mock the upstream SDK modules so we don't actually call the AI provider
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => ({
    chat: (model) => ({ modelId: model }),
  })),
}));

vi.mock("ai", async () => {
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    tool: vi.fn((config) => config),
    jsonSchema: vi.fn((s) => s),
    stepCountIs: vi.fn(),
  };
});

const makeReq = (body) => ({
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.clearAllMocks();
});

const setupStreamText = async (callbacks) => {
  const { streamText } = await import("ai");
  return streamText.mockImplementation(async ({ onChunk, onStepEnd, onEnd }) => {
    if (callbacks.chunk) {
      for (const chunk of callbacks.chunk) {
        onChunk({ chunk });
      }
    }
    if (callbacks.stepEnd) {
      for (const step of callbacks.stepEnd) {
        await onStepEnd(step);
      }
    }
    if (callbacks.end) {
      for (const end of callbacks.end) {
        await onEnd(end);
      }
    }
    return {
      text: Promise.resolve(""),
      content: Promise.resolve([]),
    };
  });
};

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
    expect(call.instructions).toMatch(/Artifact Mode/);
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
    expect(call.instructions).not.toMatch(/Artifact Mode/);
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
    expect(call.maxOutputTokens).toBe(1024);
  });

  it("uses the openrouter provider with the right baseURL", async () => {
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
        baseURL: "https://ai.hackclub.com/proxy/v1",
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
    expect(call.providerOptions.openrouter.reasoning).toEqual({ exclude: false });

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
    expect(call2.providerOptions.openrouter.reasoning).toEqual({ exclude: true });
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
    await setupStreamText({
      end: [{ usage: { promptTokens: 1, completionTokens: 2 } }],
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
    await setupStreamText({
      chunk: [
        { type: "text-delta", text: "Hello" },
        { type: "text-delta", text: " world" },
      ],
      end: [
        {
          usage: { promptTokens: 1, completionTokens: 2 },
          finalStep: { providerMetadata: {} },
          steps: [],
        },
      ],
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
    await setupStreamText({
      chunk: [{ type: "reasoning-delta", text: "hmm" }],
      end: [
        {
          usage: { promptTokens: 1, completionTokens: 1 },
          finalStep: { providerMetadata: {} },
          steps: [],
        },
      ],
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
    await setupStreamText({
      chunk: [
        { type: "tool-input-start", id: "id1", toolName: "web_search" },
        { type: "tool-input-delta", id: "id1", delta: '{"q":' },
        { type: "tool-input-delta", id: "id1", delta: '"hi"}' },
        { type: "tool-call", toolCallId: "id1", toolName: "web_search", input: { q: "hi" } },
      ],
      stepEnd: [
        {
          toolResults: [
            {
              toolName: "web_search",
              input: { q: "hi" },
              output: { answer: "answer", citations: [] },
            },
          ],
          performance: {},
          usage: {},
        },
      ],
      end: [
        {
          usage: { promptTokens: 1, completionTokens: 1 },
          finalStep: { providerMetadata: {} },
          steps: [],
        },
      ],
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
    await setupStreamText({
      chunk: [{ type: "text-delta", text: "x" }],
      end: [
        {
          usage: { inputTokens: 5, outputTokens: 7, outputTokenDetails: { reasoningTokens: 3 } },
          finalStep: {
            providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
          },
          steps: [],
        },
      ],
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

  it("uses cumulative totalUsage from usage event and reports reasoning tokens", async () => {
    await setupStreamText({
      chunk: [{ type: "text-delta", text: "x" }],
      stepEnd: [
        {
          toolResults: [],
          performance: { outputTokensPerSecond: 5.03 },
          usage: { inputTokens: 5, outputTokens: 7 },
        },
      ],
      end: [
        {
          usage: {
            inputTokens: 5,
            outputTokens: 7,
            outputTokenDetails: { reasoningTokens: 3 },
            totalTokens: 12,
          },
          finalStep: {
            providerMetadata: { openrouter: { usage: { cost: 0.002 } } },
          },
          steps: [],
        },
      ],
    });

    const res = await POST(
      makeReq({ model: TEST_MODEL, messages: [{ role: "user", content: "hi" }], apiKey: "k" }),
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
    expect(out).toContain('"inputTokens":5');
    expect(out).toContain('"outputTokens":7');
    expect(out).toContain('"reasoningTokens":3');
    expect(out).toContain('"cost":0.002');
  });

  it("uses server-provided tokensPerSecond from step performance", async () => {
    await setupStreamText({
      chunk: [{ type: "text-delta", text: "x" }],
      stepEnd: [
        {
          toolResults: [],
          performance: { outputTokensPerSecond: 5.03 },
          usage: { inputTokens: 5, outputTokens: 7 },
        },
      ],
      end: [
        {
          usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
          finalStep: {
            providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
            performance: { outputTokensPerSecond: 5.03 },
          },
          steps: [],
        },
      ],
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
    expect(out).toContain('"tokensPerSecond":5.03');
  });

  it("emits an error event and closes the stream on failure", async () => {
    const { streamText } = await import("ai");
    streamText.mockRejectedValue(new Error("stream boom"));

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

  it("uses server-provided outputTokensPerSecond for tokensPerSecond", async () => {
    await setupStreamText({
      chunk: [
        { type: "text-delta", text: "Hello" },
        { type: "tool-input-start", id: "t1", toolName: "web_search" },
        { type: "tool-input-delta", id: "t1", delta: '{"q":' },
        { type: "tool-call", toolCallId: "t1", toolName: "web_search", input: { q: "x" } },
        { type: "text-delta", text: " world" },
      ],
      stepEnd: [
        {
          toolResults: [
            {
              toolName: "web_search",
              input: { q: "x" },
              output: { answer: "ok", citations: [] },
            },
          ],
          performance: { outputTokensPerSecond: 5.03 },
          usage: { inputTokens: 5, outputTokens: 10 },
        },
      ],
      end: [
        {
          usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
          finalStep: {
            providerMetadata: { openrouter: { usage: { cost: 0.001 } } },
            performance: { outputTokensPerSecond: 5.03 },
          },
          steps: [],
        },
      ],
    });

    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

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

      const usageStart = out.indexOf('data: {"type":"usage"');
      expect(usageStart).toBeGreaterThan(-1);
      const usageEnd = out.indexOf("\n\n", usageStart);
      const usageJson = usageEnd > -1 ? out.slice(usageStart + 6, usageEnd) : out.slice(usageStart + 6);
      const data = JSON.parse(usageJson);

      // Wall-clock duration spans the entire stream (~0ms in mock)
      expect(data.usage.duration).toBeCloseTo(0, 5);
      // tokensPerSecond comes from server-provided step performance
      expect(data.usage.tokensPerSecond).toBe(5.03);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it("emits sandbox_result events from onStepEnd toolResults", async () => {
    await setupStreamText({
      chunk: [
        { type: "tool-input-start", id: "t1", toolName: "execute_code" },
        { type: "tool-input-delta", id: "t1", delta: '{"code":' },
        { type: "tool-call", toolCallId: "t1", toolName: "execute_code", input: { code: "console.log(1)" } },
      ],
      stepEnd: [
        {
          toolResults: [
            {
              toolName: "execute_code",
              input: { code: "console.log(1)" },
              output: {
                code: "console.log(1)",
                stdout: "1\n",
                stderr: "",
                exitCode: 0,
                sandboxId: "sandbox-123",
              },
            },
          ],
          performance: {},
          usage: {},
        },
      ],
      end: [
        {
          usage: { promptTokens: 1, completionTokens: 1 },
          finalStep: { providerMetadata: {} },
          steps: [],
        },
      ],
    });

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        agentMode: true,
        conversationId: "conv-1",
        e2bApiKey: "e2b-key",
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
    expect(out).toContain('"type":"sandbox_result"');
    expect(out).toContain('"tool":"execute_code"');
    expect(out).toContain('"stdout":"1\\n"');
    expect(out).toContain('"exitCode":0');
    expect(out).toContain('"sandboxId":"sandbox-123"');
  });

  it("emits search_result events from onStepEnd web_search toolResults", async () => {
    await setupStreamText({
      chunk: [
        { type: "tool-input-start", id: "t1", toolName: "web_search" },
        { type: "tool-call", toolCallId: "t1", toolName: "web_search", input: { q: "test" } },
      ],
      stepEnd: [
        {
          toolResults: [
            {
              toolName: "web_search",
              input: { q: "test" },
              output: { answer: "test answer", citations: [{ title: "src" }] },
            },
          ],
          performance: {},
          usage: {},
        },
      ],
      end: [
        {
          usage: { promptTokens: 1, completionTokens: 1 },
          finalStep: { providerMetadata: {} },
          steps: [],
        },
      ],
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
    expect(out).toContain('"type":"search_result"');
    expect(out).toContain('"content":"test answer"');
    expect(out).toContain('"title":"src"');
  });
});
