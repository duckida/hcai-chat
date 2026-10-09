import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const TEST_MODEL = "xiaomi/mimo-v2.5";

// Mock the official OpenAI client: no network.
const harness = vi.hoisted(() => ({
  create: vi.fn(),
  ctorOpts: [],
}));

vi.mock("openai", () => ({
  default: class {
    constructor(opts) {
      harness.ctorOpts.push(opts);
      return { chat: { completions: { create: harness.create } } };
    }
  },
}));

const makeReq = (body) => ({
  json: () => Promise.resolve(body),
});

const streamOf = (events) => ({
  async *[Symbol.asyncIterator]() {
    for (const e of events) yield e;
  },
});

const contentChunk = (text) => ({
  choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
});
const reasoningChunk = (text) => ({
  choices: [{ index: 0, delta: { reasoning: text }, finish_reason: null }],
});
const toolCallStart = (index, id, name) => ({
  choices: [
    {
      index: 0,
      delta: {
        tool_calls: [
          { index, id, type: "function", function: { name, arguments: "" } },
        ],
      },
      finish_reason: null,
    },
  ],
});
const toolArgsDelta = (index, args) => ({
  choices: [
    { delta: { tool_calls: [{ index, function: { arguments: args } }] }, finish_reason: null },
  ],
});
const finish = (reason, usage) => ({
  choices: [{ index: 0, delta: {}, finish_reason: reason }],
  ...(usage ? { usage } : {}),
});
const USAGE = {
  prompt_tokens: 5,
  completion_tokens: 7,
  total_tokens: 12,
  cost: 0.001,
  completion_tokens_details: { reasoning_tokens: 3 },
};

const drain = async (res) => {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
};

const lastParams = () => harness.create.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  harness.ctorOpts.length = 0;
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
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "Hi there" }, finish_reason: "stop" }],
    });

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "key",
        stream: false,
      }),
    );

    const data = await res.json();
    expect(data.text).toBe("Hi there");
    expect(data.finishReason).toBe("stop");
  });

  it("hoists a system message into the instructions message", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [
          { role: "system", content: "You are a pirate." },
          { role: "user", content: "hi" },
        ],
        apiKey: "k",
        stream: false,
      }),
    );

    const params = lastParams();
    expect(params.messages[0].role).toBe("system");
    expect(params.messages[0].content).toContain("You are a pirate.");
    // Remaining messages keep their original roles.
    expect(params.messages[1].role).toBe("user");
  });

  it("joins several system messages and ignores empty ones", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [
          { role: "system", content: "first" },
          { role: "system", content: "   " },
          { role: "system", content: "second" },
          { role: "user", content: "hi" },
        ],
        apiKey: "k",
        stream: false,
      }),
    );

    const params = lastParams();
    expect(params.messages[0].content).toContain("first\n\nsecond");
    expect(
      params.messages.some((m) => m.role === "system" && m !== params.messages[0]),
    ).toBe(false);
  });

  it("keeps the date preamble alongside a hoisted system message", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [
          { role: "system", content: "Be brief." },
          { role: "user", content: "hi" },
        ],
        apiKey: "k",
        stream: false,
      }),
    );

    expect(lastParams().messages[0].content).toMatch(/^Current date:/);
  });

  it("flattens an array-shaped system message", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [
          {
            role: "system",
            content: [{ type: "text", text: "arr-yst" }],
          },
          { role: "user", content: "hi" },
        ],
        apiKey: "k",
        stream: false,
      }),
    );

    expect(lastParams().messages[0].content).toContain("arr-yst");
  });

  it("passes maxTokens to create() when provided", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
        max_tokens: 123,
      }),
    );

    expect(lastParams().max_tokens).toBe(123);
  });

  it("creates the OpenAI client with the Hack Club proxy baseURL", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "sk-test-key",
        stream: false,
      }),
    );

    expect(harness.ctorOpts[0].apiKey).toBe("sk-test-key");
    expect(harness.ctorOpts[0].baseURL).toBe(
      "https://ai.hackclub.com/proxy/v1",
    );
  });

  it("turns a thinking level into OpenRouter reasoning fields", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        thinkingLevel: "high",
        stream: false,
      }),
    );

    expect(lastParams().include_reasoning).toBe(true);
    expect(lastParams().reasoning).toEqual({ effort: "high", exclude: false });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        thinkingLevel: "off",
        stream: false,
      }),
    );

    expect(harness.create.mock.calls[1][0].include_reasoning).toBe(false);
    expect(harness.create.mock.calls[1][0].reasoning).toEqual({
      enabled: false,
      exclude: true,
    });
  });

  it("reasons at the default level when the request names no level", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
      }),
    );

    expect(lastParams().reasoning).toEqual({
      effort: "medium",
      exclude: false,
    });
  });

  it("does not forward a level the model would reject", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        thinkingLevel: "galaxy-brain",
        stream: false,
      }),
    );

    expect(lastParams().reasoning.effort).toBe("medium");
  });

  it("forwards valid function tools without inventing execute closures", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

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
              parameters: {
                type: "object",
                properties: { expression: { type: "string" } },
              },
            },
          },
          { type: "not-a-function" },
          { type: "function" },
        ],
      }),
    );

    const tools = lastParams().tools;
    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe("javascript_calculator");
    expect(tools[0].function.parameters).toEqual({
      type: "object",
      properties: { expression: { type: "string" } },
    });
    expect(tools[0]).not.toHaveProperty("execute");
  });

  it("returns a streaming response when stream is not false", async () => {
    harness.create.mockReturnValue(streamOf([contentChunk("Hello")]));

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );

    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("emits a text-delta event as a content chunk", async () => {
    harness.create.mockReturnValue(
      streamOf([contentChunk("Hello"), finish("stop", USAGE)]),
    );

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );

    expect(await drain(res)).toContain('"content":"Hello"');
  });

  it("emits a reasoning delta as a thinking chunk", async () => {
    harness.create.mockReturnValue(
      streamOf([reasoningChunk("thinking..."), finish("stop", USAGE)]),
    );

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );

    expect(await drain(res)).toContain('"thinking":"thinking..."');
  });

  it("passes tool_calls deltas through unchanged", async () => {
    harness.create.mockReturnValue(
      streamOf([
        toolCallStart(0, "call_1", "web_search"),
        toolArgsDelta(0, '{"query":"hello"}'),
        finish("tool_calls"),
      ]),
    );

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "search hello" }],
        apiKey: "k",
        tools: [
          {
            type: "function",
            function: { name: "web_search", description: "search", parameters: {} },
          },
        ],
      }),
    );

    const out = await drain(res);
    expect(out).toContain('"tool_calls"');
    expect(out).toContain("hello");
  });

  it("emits a usage event before [DONE]", async () => {
    harness.create.mockReturnValue(
      streamOf([contentChunk("hi"), finish("stop", USAGE)]),
    );

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );

    const out = await drain(res);
    expect(out).toContain('"type":"usage"');
    expect(out).toContain('"inputTokens":5');
    expect(out).toContain('"outputTokens":7');
    expect(out).toContain('"reasoningTokens":3');
    expect(out).toContain('"cost":0.001');
    expect(out).toContain("data: [DONE]");
  });

  it("emits an error event and closes the stream on create() failure", async () => {
    harness.create.mockImplementation(() => {
      throw new Error("stream boom");
    });

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );

    const out = await drain(res);
    expect(out).toContain('"type":"error"');
    expect(out).toContain("stream boom");
  });

  it("closes markerless upwards-cut streams mid-answer", async () => {
    // stream yields content, never a finish_reason, and then just stops.
    harness.create.mockReturnValue(streamOf([contentChunk("partial answer")]));

    const res = await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );

    const out = await drain(res);
    expect(out).toContain('"content":"partial answer"');
    expect(out).not.toContain("data: [DONE]");
  });

  it("passes stream_options include_usage to the SDK", async () => {
    harness.create.mockReturnValue(streamOf([contentChunk("x"), finish("stop")]));

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
      }),
    );

    expect(lastParams().stream_options).toEqual({ include_usage: true });
  });

  it("agent mode appends the sandbox instructions to the system prompt", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [{ role: "user", content: "hi" }],
        apiKey: "k",
        stream: false,
        agentMode: true,
      }),
    );

    expect(lastParams().messages[0].content).toContain(
      "Agent Mode",
    );
    expect(lastParams().messages[0].content).toContain("execute_code");
  });

  it("tool_calls on assistant messages pass through, thinking field is stripped", async () => {
    harness.create.mockResolvedValue({
      choices: [{ message: { content: "x" }, finish_reason: "stop" }],
    });

    await POST(
      makeReq({
        model: TEST_MODEL,
        messages: [
          { role: "user", content: "q" },
          {
            role: "assistant",
            content: "",
            thinking: "hmm",
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "web_search", arguments: '{"q":"x"}' },
              },
            ],
          },
          { role: "tool", content: "result", tool_call_id: "c1" },
        ],
        apiKey: "k",
        stream: false,
      }),
    );

    const params = lastParams();
    // messages: [system, user, assistant, tool]
    const assistant = params.messages[2];
    expect(assistant.role).toBe("assistant");
    expect(assistant.tool_calls).toHaveLength(1);
    expect(assistant).not.toHaveProperty("thinking");
    const toolMsg = params.messages[3];
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("c1");
    expect(toolMsg.content).toBe("result");
  });
});
