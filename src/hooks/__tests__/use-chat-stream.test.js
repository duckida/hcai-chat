import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useConversations } from "@/hooks/use-conversations";

vi.mock("@/lib/api-client", async () => {
  // Keep the real module: the streaming internals call getStoredApiKey
  // through the module's own binding, which a mock-factory override would
  // not reach. The key is seeded in localStorage by the tests instead.
  const actual = await vi.importActual("@/lib/api-client");
  return {
    ...actual,
    generateTitle: vi.fn(async () => "Generated Title"),
  };
});

vi.mock("@/lib/db", () => ({
  getAllConversations: vi.fn(async () => []),
  saveAllConversations: vi.fn(async () => {}),
  putConversation: vi.fn(async () => {}),
  deleteConversation: vi.fn(async () => {}),
}));

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

const delta = (content) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

// Both hooks must render inside one component: the stream hook closes over
// the conversations object, so rendering them separately would capture a
// stale snapshot and never see state updates.
function useHarness(overrides = {}) {
  const conversations = useConversations({
    selectedModel: "xiaomi/mimo-v2.5",
  });
  const stream = useChatStream({
    conversations,
    activeConversation: conversations.activeConversation,
    messagesRef: conversations.messagesRef,
    setMessages: conversations.setMessages,
    patchConversation: conversations.patchConversation,
    selectedModel: "xiaomi/mimo-v2.5",
    titleGenerationModel: "qwen/qwen3.6-flash",
    thinkingEnabled: true,
    artifactsEnabled: false,
    webSearchEnabled: false,
    agentModeEnabled: false,
    maxTokens: 32000,
    toolsSupported: true,
    isDesktop: true,
    ...overrides,
  });
  return { conversations, stream };
}

// setup() hands back the raw renderHook result: the hooks return fresh
// objects on every render, so anything captured at bind time goes stale
// the moment send() updates state. Tests must read result.current live.
async function setup(overrides = {}) {
  const result = renderHook(() => useHarness(overrides));
  // Let the conversations mount effect (the async load) settle first:
  // if it resolves mid-send it resets messages and clobbers the turn.
  await act(async () => {});
  return result;
}

describe("useChatStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("hack_club_ai_key", "sk-hc-test-key");
    localStorage.setItem("e2b_api_key", "e2b-test-key");
    vi.stubGlobal("fetch", () => {});
  });

  it("starts idle with empty accumulators", async () => {
    const result = await setup();
    expect(result.result.current.stream.isLoading).toBe(false);
    expect(result.result.current.stream.streamingContent).toBe("");
    expect(result.result.current.stream.streamingThinking).toBe("");
    expect(result.result.current.stream.streamingSandboxTools).toEqual([]);
  });

  it("sends a message and streams the response back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeStreamResponse([delta("Hello"), "data: [DONE]\n\n"])),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    expect(result.result.current.conversations.messages).toHaveLength(2);
    expect(result.result.current.conversations.messages[0].role).toBe("user");
    expect(result.result.current.conversations.messages[0].content).toBe("hi");
    expect(result.result.current.conversations.messages[1].role).toBe("assistant");
    expect(result.result.current.conversations.messages[1].content).toBe("Hello");
  });

  it("commits the final deltas even if a chunk has not re-rendered", async () => {
    // The completion path must read the live accumulators, not a render
    // snapshot — otherwise the tail of a stream is dropped.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeStreamResponse([delta("tail-"), delta("end"), "data: [DONE]\n\n"]),
      ),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    expect(result.result.current.conversations.messages[1].content).toBe("tail-end");
  });

  it("clears the streaming accumulators after committing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeStreamResponse([delta("Hello"), "data: [DONE]\n\n"])),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    expect(result.result.current.stream.streamingContent).toBe("");
    expect(result.result.current.stream.streamingThinking).toBe("");
    expect(result.result.current.stream.isLoading).toBe(false);
  });

  it("creates a conversation when sending on an empty store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeStreamResponse([delta("Hi"), "data: [DONE]\n\n"])),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("first message", []);
    });

    expect(result.result.current.conversations.conversations).toHaveLength(1);
    expect(result.result.current.conversations.activeConversation).toBeTruthy();
  });

  it("stores an error placeholder when the response is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeStreamResponse(["data: [DONE]\n\n"])),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    expect(result.result.current.conversations.messages[1].role).toBe("assistant");
    expect(result.result.current.conversations.messages[1].content).toBe("");
    expect(result.result.current.conversations.messages[1].error).toBeTruthy();
    expect(result.result.current.conversations.messages[1].error.details).toContain(
      "mimo-v2.5",
    );
  });

  it("surfaces a server error event as an error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeStreamResponse([
          `data: ${JSON.stringify({ type: "error", error: "Upstream down" })}\n\n`,
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    expect(result.result.current.stream.streamingError).toBeTruthy();
    expect(result.result.current.conversations.messages[1].error.details).toBe(
      "Upstream down",
    );
  });

  it("attributes usage to the conversation that started the request", async () => {
    let resolveUsage;
    const usageBody = new Promise((resolve) => {
      resolveUsage = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeStreamResponse([
          delta("Hello"),
          `data: ${JSON.stringify({
            type: "usage",
            usage: {
              model: "xiaomi/mimo-v2.5",
              inputTokens: 100,
              outputTokens: 5,
              totalTokens: 105,
              duration: 0.5,
              tokensPerSecond: 10,
              cost: 0,
            },
          })}\n\n`,
          "data: [DONE]\n\n",
        ]),
      ),
    );

    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    // Usage must be attributed to the conversation that owned the request,
    // even though it was created during the send itself.
    const sendingId = result.result.current.conversations.activeConversation;
    expect(sendingId).toBeTruthy();
    await waitFor(() => {
      const conv = result.result.current.conversations.conversations.find(
        (c) => c.id === sendingId,
      );
      return conv?.contextUsage === 105;
    });
    expect(
      result.result.current.conversations.conversations.find(
        (c) => c.id === sendingId,
      ).contextUsage,
    ).toBe(105);
    expect(result.result.current.stream.contextUsage).toBe(105);

    void resolveUsage;
  });

  it("tracks sandbox tool calls while streaming", async () => {
    const result = await setup({ agentModeEnabled: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeStreamResponse([
          `data: ${JSON.stringify({
            type: "sandbox_result",
            tool: "execute_code",
            code: "console.log(1)",
            stdout: "1",
            stderr: "",
            exitCode: 0,
            sandboxId: "sbx-1",
          })}\n\n`,
          "data: [DONE]\n\n",
        ]),
      ),
    );

    await act(async () => {
      await result.result.current.stream.send("run it", []);
    });

    expect(result.result.current.stream.streamingSandboxTools).toHaveLength(1);
    expect(result.result.current.stream.streamingSandboxTools[0]).toMatchObject({
      tool: "execute_code",
      status: "complete",
      stdout: "1",
      exitCode: 0,
      sandboxId: "sbx-1",
    });
  });

  it("refuses to send while a previous submission is in flight", async () => {
    let resolveFirst;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveFirst = resolve))),
    );
    const result = await setup();

    act(() => {
      result.result.current.stream.send("first", []);
    });
    await act(async () => {});
    await act(async () => {
      await result.result.current.stream.send("second", []);
    });

    resolveFirst?.(
      makeStreamResponse([delta("first response"), "data: [DONE]\n\n"]),
    );
    await act(async () => {});

    expect(
      result.result.current.conversations.messages.filter((m) => m.role === "user"),
    ).toHaveLength(1);
  });

  it("records metrics on the committed assistant message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeStreamResponse([
          delta("Hello"),
          `data: ${JSON.stringify({
            type: "usage",
            usage: {
              model: "xiaomi/mimo-v2.5",
              inputTokens: 10,
              outputTokens: 2,
              totalTokens: 12,
              duration: 0.5,
              tokensPerSecond: 4,
              cost: 0.0001,
            },
          })}\n\n`,
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    expect(result.result.current.conversations.messages[1].metrics).toMatchObject({
      inputTokens: 10,
      outputTokens: 2,
    });
  });
});
