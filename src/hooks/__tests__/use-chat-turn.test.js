import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateTitle } from "@/lib/api-client";
import { useChatTurn } from "@/hooks/use-chat-turn";
import { resetConversations, useConversations } from "@/stores/conversations";
import { resetTurn } from "@/stores/turn";

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

// The thinking/tool frames, in the shapes src/app/api/chat/route.js emits:
// a complete tool-call frame carries the index, the id (api-client reads the
// id as "complete"), the name, and the full normalized arguments.
const think = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { thinking: text } }] })}\n\n`;

const toolCall = (index, id, name, args) =>
  `data: ${JSON.stringify({
    choices: [
      {
        delta: {
          tool_calls: [{ index, id, function: { name, arguments: args } }],
        },
      },
    ],
  })}\n\n`;

const usageFrame = (inputTokens, outputTokens) =>
  `data: ${JSON.stringify({
    type: "usage",
    usage: {
      model: "xiaomi/mimo-v2.5",
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      duration: 0.5,
      tokensPerSecond: 10,
      cost: 0,
    },
  })}\n\n`;

// Routes the agent loop's fetches: queued /api/chat rounds (one stream per
// round), then the on-demand tool endpoints. Returns the mock so tests can
// inspect the calls.
const mockLoopFetch = ({ chatRounds, toolsResponse, sandboxResponse }) => {
  const pendingRounds = [...chatRounds];
  return vi.fn().mockImplementation(async (url) => {
    if (url === "/api/chat") {
      const round = pendingRounds.shift();
      if (!round) throw new Error("unexpected /api/chat call");
      return makeStreamResponse(round);
    }
    if (url === "/api/tools") return toolsResponse;
    if (url === "/api/sandbox") return sandboxResponse;
    throw new Error(`unexpected fetch: ${url}`);
  });
};

const searchResult = (sources) =>
  `data: ${JSON.stringify({ type: "search_result", sources, content: "ok" })}\n\n`;

// A stream that delivers one content delta, then aborts the body read — the
// same shape as the proxy's mid-stream QUIC reset.
function makeAbortableStreamResponse(partialText, deltaCount) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => {
          index += 1;
          if (index <= deltaCount) {
            return Promise.resolve({
              done: false,
              value: encoder.encode(delta(partialText)),
            });
          }
          return Promise.reject(new Error("network reset"));
        },
      }),
    },
  };
}

// A tool turn commits one merged assistant message followed by the tool
// records it kept for context (invisible in the thread), so the answer is the
// LAST assistant — not the last message.
const finalAssistantOf = (result) =>
  result.result.current.conversations.messages
    .filter((m) => m.role === "assistant")
    .at(-1);

const toolRecordsOf = (result) =>
  result.result.current.conversations.messages.filter((m) => m.role === "tool");

// Conversation state lives in the conversations store and turn state in the
// turn store, so the two hooks observe the same modules even though they are
// separate callers.
function useHarness(overrides = {}) {
  const conversations = useConversations();
  const stream = useChatTurn({
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

describe("useChatTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetConversations();
    // Turn state is module-level now, so a committed error or a stuck
    // isLoading would otherwise leak into the next test.
    resetTurn();
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

  it("titles a conversation from the first turn", async () => {
    vi.stubGlobal(
      "fetch",
      // Per turn, not per test: a single shared response has one reader, and
      // it is exhausted after the first turn — turn 2 would then see an empty
      // stream and take the error path instead of reaching the title.
      vi
        .fn()
        .mockImplementation(() =>
          makeStreamResponse([delta("Hello"), "data: [DONE]\n\n"]),
        ),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("what is a semaphore", []);
    });

    expect(generateTitle).toHaveBeenCalledTimes(1);
    expect(generateTitle).toHaveBeenCalledWith(
      "what is a semaphore",
      "qwen/qwen3.6-flash",
    );
    await waitFor(() =>
      expect(result.result.current.conversations.conversations[0].title).toBe(
        "Generated Title",
      ),
    );
  });

  it("titles a conversation that never got one, however many turns it took", async () => {
    // The first turn can leave "New Chat" behind: a failed title request falls
    // back to the raw message, and an empty/error turn returns before it ever
    // runs. Either way the conversation is still titled "New Chat", and it must
    // recover on the next turn rather than needing exactly two messages.
    vi.stubGlobal(
      "fetch",
      // Fresh response per turn — see the note in the test above.
      vi
        .fn()
        .mockImplementation(() =>
          makeStreamResponse([delta("Hello"), "data: [DONE]\n\n"]),
        ),
    );
    const result = await setup();

    generateTitle.mockResolvedValueOnce("New Chat");
    await act(async () => {
      await result.result.current.stream.send("what is a semaphore", []);
    });
    expect(
      result.result.current.conversations.conversations[0].title,
    ).toBe("New Chat");
    expect(result.result.current.conversations.messages).toHaveLength(2);

    generateTitle.mockResolvedValueOnce("Generated Title");
    await act(async () => {
      await result.result.current.stream.send("and a mutex", []);
    });

    expect(generateTitle).toHaveBeenCalledTimes(2);
    // From the conversation's first message, not the one just typed: the topic
    // is what the user originally asked about.
    expect(generateTitle).toHaveBeenLastCalledWith(
      "what is a semaphore",
      "qwen/qwen3.6-flash",
    );
    await waitFor(() =>
      expect(result.result.current.conversations.conversations[0].title).toBe(
        "Generated Title",
      ),
    );
  });

  it("stores an error placeholder when the response is empty", async () => {
    // An empty stream triggers one streamed retry; when the retry also
    // delivers nothing, the turn commits as an error placeholder.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(makeStreamResponse(["data: [DONE]\n\n"])),
      ),
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

  it("appends the continuation to the partial when the stream is cut", async () => {
    // The stream dies after one delta with no [DONE]. The client continues
    // from the partial instead of regenerating, so the second stream carries
    // only the remainder — the message must come out as one seamless answer,
    // never as the partial plus a whole new one (finding 17).
    let streamed = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        streamed += 1;
        if (streamed === 1) {
          return Promise.resolve(
            makeStreamResponse([delta("Half an answer that never fin")]),
          );
        }
        return Promise.resolve(
          makeStreamResponse([
            delta("ished just fine."),
            "data: [DONE]\n\n",
          ]),
        );
      }),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    const message = result.result.current.conversations.messages[1];
    expect(message.content).toBe("Half an answer that never finished just fine.");
    expect(message.error).toBeUndefined();
  });

  it("keeps the partial text and thinking when every continuation fails", async () => {
    // The cut stream and the legs sent after it are all gone. Whatever
    // arrived before the failure is all the user has of that answer —
    // committing an empty box would destroy text they already read. An empty
    // leg is continued again (once), so this takes three requests.
    let streamed = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      streamed += 1;
      if (streamed === 1) {
        return Promise.resolve(
          makeStreamResponse([
            think("Considering it. "),
            delta("Half an answer that never fin"),
            // No [DONE]: the connection was cut mid-answer.
          ]),
        );
      }
      return Promise.reject(new Error("network is gone"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    const message = result.result.current.conversations.messages[1];
    expect(message.role).toBe("assistant");
    expect(message.content).toBe("Half an answer that never fin");
    expect(message.thinking).toBe("Considering it. ");
    expect(message.error).toBeTruthy();
    expect(message.error.details).toContain("network is gone");
    // One attempt + two empty legs: emptyLegs is what stops the loop, and a
    // thrown leg still surfaces its own error message rather than a generic.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("commits a thinking-only turn without an error or a retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeStreamResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { thinking: "Let me try." } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    const assistant = result.result.current.conversations.messages.find(
      (m) => m.role === "assistant",
    );
    expect(assistant.content).toBe("");
    expect(assistant.thinking).toBe("Let me try.");
    expect(assistant.error).toBeFalsy();
    expect(result.result.current.stream.streamingError).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("thinking chips", () => {
    const assistantOf = (result) =>
      result.result.current.conversations.messages.find(
        (m) => m.role === "assistant",
      );

    it("commits a calculator chip pinned where the reasoning was interrupted", async () => {
      const prefix = "I should check this. ";
      const fetchMock = mockLoopFetch({
        chatRounds: [
          // Round 1: the model reaches for the calculator mid-reasoning.
          [
            think(prefix),
            toolCall(0, "call_1", "javascript_calculator", '{"expression":"5 + 5"}'),
            "data: [DONE]\n\n",
          ],
          // Round 2: after the tool result, the model finishes.
          [
            think("The sum is straightforward."),
            delta("The answer is 10."),
            usageFrame(50, 7),
            "data: [DONE]\n\n",
          ],
        ],
        toolsResponse: Response.json({
          tool: "javascript_calculator",
          result: "10",
          rawResult: 10,
          sources: [],
          metadata: { expression: "5 + 5", success: true },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const result = await setup();

      await act(async () => {
        await result.result.current.stream.send("whats 5+5", []);
      });

      // The cache of rounds merges into one assistant message at the end.
      // The chip stays pinned to the point in the thinking where the model
      // reached for the tool, and the thinking text is appended across rounds.
      const round = assistantOf(result);
      expect(round.thinking).toBe(
        `${prefix}The sum is straightforward.`,
      );
      expect(round.thinkingChips).toEqual([
        // `at` is the prefix's length, not the whole reasoning: the chip
        // belongs *inside* the thinking at the moment the model reached for
        // the tool, and the text that arrived afterwards must not drag it.
        { tool: "javascript_calculator", at: prefix.length, label: "5 + 5" },
      ]);
      // The merged message keeps the turn's tool_calls so the tool record
      // committed after it stays a valid pair for the next request.
      expect(round.tool_calls).toEqual([
        {
          id: "call_1",
          type: "function",
          function: {
            name: "javascript_calculator",
            arguments: '{"expression":"5 + 5"}',
          },
        },
      ]);

      expect(finalAssistantOf(result).content).toBe("The answer is 10.");
      // The tool result is kept as context, not as its own bubble.
      expect(toolRecordsOf(result)).toHaveLength(1);
    });

    it("fills a search chip with domains once the results arrive", async () => {
      const prefix = "Let me look that up. ";
      const fetchMock = mockLoopFetch({
        chatRounds: [
          [
            think(prefix),
            toolCall(0, "call_1", "web_search", '{"query":"opencode vs claude"}'),
            "data: [DONE]\n\n",
          ],
          [
            think("Now I can answer."),
            delta("Here it is."),
            usageFrame(50, 7),
            "data: [DONE]\n\n",
          ],
        ],
        toolsResponse: Response.json({
          tool: "web_search",
          result: "opencode and claude are both AI tools.",
          rawResult: {
            answer: "opencode and claude are both AI tools.",
            citations: [
              { title: "reddit", url: "https://www.reddit.com/r/ai" },
              { title: "txt", url: "https://txt.com/" },
            ],
          },
          sources: ["https://www.reddit.com/r/ai", "https://txt.com/"],
          metadata: { query: "opencode vs claude", numResults: 5, success: true },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const result = await setup({ webSearchEnabled: true });

      await act(async () => {
        await result.result.current.stream.send("search for it", []);
      });

      expect(assistantOf(result).thinkingChips).toEqual([
        {
          tool: "web_search",
          at: prefix.length,
          label: "opencode vs claude",
          sources: [
            { domain: "reddit.com", href: "https://www.reddit.com/r/ai" },
            { domain: "txt.com", href: "https://txt.com/" },
          ],
        },
      ]);
    });

    it("never chips a sandbox tool — its commands belong to the side panel", async () => {
      const fetchMock = mockLoopFetch({
        chatRounds: [
          [
            think("Let me run the code. "),
            toolCall(0, "call_1", "execute_code", '{"code":"print(1)"}'),
            "data: [DONE]\n\n",
          ],
          [delta("It printed."), usageFrame(60, 9), "data: [DONE]\n\n"],
        ],
        sandboxResponse: Response.json({
          stdout: "1\n",
          stderr: "",
          exitCode: 0,
          sandboxId: "sbx-1",
          action: "execute",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const result = await setup({ agentModeEnabled: true });

      await act(async () => {
        await result.result.current.stream.send("run it", []);
      });

      const round = assistantOf(result);
      expect(round.thinking).toBe("Let me run the code. ");
      expect(round.thinkingChips).toBeUndefined();
      // The run landed in the side panel, not the thread.
      expect(result.result.current.stream.streamingSandboxTools).toHaveLength(1);
      expect(
        result.result.current.stream.streamingSandboxTools[0],
      ).toMatchObject({
        tool: "execute_code",
        status: "complete",
        stdout: "1\n",
      });
      expect(finalAssistantOf(result).content).toBe("It printed.");
      // The sandbox output is kept as context on the turn, invisibly.
      expect(toolRecordsOf(result)).toHaveLength(1);
    });
  });

  it("restores context usage for the conversation it is reset to", async () => {
    // ChatApp resets the turn on every conversation switch with the restored
    // conversation, so this is what stops one chat's usage leaking onto the
    // ring of the next one.
    const result = await setup();

    act(() => {
      result.result.current.stream.resetForConversation({ contextUsage: 4500 });
    });
    expect(result.result.current.stream.contextUsage).toBe(4500);

    act(() => {
      result.result.current.stream.resetForConversation(null);
    });
    expect(result.result.current.stream.contextUsage).toBe(0);
    expect(result.result.current.stream.streamingContent).toBe("");
    expect(result.result.current.stream.streamingError).toBeNull();
  });

  it("scopes the stream to its conversation and clears it on reset", async () => {
    let resolveStream;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveStream = resolve))),
    );
    const result = await setup();

    act(() => {
      result.result.current.stream.send("hi", []);
    });
    await act(async () => {});

    expect(result.result.current.stream.streamingConversationId).toBe(
      result.result.current.conversations.activeConversation,
    );

    act(() => {
      result.result.current.stream.resetForConversation(null);
    });
    expect(result.result.current.stream.streamingConversationId).toBeNull();

    await act(async () => {
      resolveStream(makeStreamResponse([delta("late"), "data: [DONE]\n\n"]));
    });
  });

  it("does not clobber the active conversation when the stream completes after switching away", async () => {
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

    const owningId = result.result.current.conversations.activeConversation;
    expect(owningId).toBeTruthy();

    act(() => {
      result.result.current.conversations.newConversation();
    });
    await act(async () => {});
    expect(result.result.current.conversations.activeConversation).not.toBe(
      owningId,
    );

    await act(async () => {
      resolveFirst(
        makeStreamResponse([delta("late reply"), "data: [DONE]\n\n"]),
      );
    });

    const owning = result.result.current.conversations.conversations.find(
      (c) => c.id === owningId,
    );
    expect(
      owning.messages.some(
        (m) => m.role === "assistant" && m.content === "late reply",
      ),
    ).toBe(true);
    expect(result.result.current.conversations.messages).toHaveLength(0);
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

  it("does not duplicate the response when a dropped stream continues", async () => {
    // The proxy can kill an SSE stream mid-response (QUIC reset). The client
    // continues from the partial instead of regenerating, so the second
    // stream carries only the remainder — the message must contain the
    // answer once, as one sentence, never a partial followed by a repeat.
    let streamed = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        streamed += 1;
        if (streamed === 1) {
          return Promise.resolve(makeAbortableStreamResponse("Partial", 1));
        }
        return Promise.resolve(
          makeStreamResponse([
            delta(" — continued to the end."),
            "data: [DONE]\n\n",
          ]),
        );
      }),
    );

    const result = await setup();
    await act(async () => {
      await result.result.current.stream.send("hi", []);
    });

    const assistant =
      result.result.current.conversations.messages.find(
        (m) => m.role === "assistant",
      );
    expect(assistant.content).toBe("Partial — continued to the end.");
    expect(assistant.content).not.toMatch(/Partial.*Partial/);
    expect(
      result.result.current.conversations.messages.filter((m) => m.role === "user"),
    ).toHaveLength(1);
  });

  // ---- across-turn context -------------------------------------------------
  // The two invariants below are the halves of "the response is not truncated
  // and prior conversation context is not lost across turns" (970d4da). The
  // truncation half has its own test above; these cover the context half, which
  // is a property of the *second* request, not the first.

  it("sends the whole conversation, not just the newest message", async () => {
    // If the second request carried only "and then?", the model would answer
    // with no memory of the exchange that produced it — the failure mode is a
    // plausible answer to the wrong question, so nothing on screen looks wrong.
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url, opts) => {
        if (opts?.body) bodies.push(JSON.parse(opts.body));
        return Promise.resolve(
          makeStreamResponse([delta("ok"), "data: [DONE]\n\n"]),
        );
      }),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("first question", []);
    });
    await act(async () => {
      await result.result.current.stream.send("and then?", []);
    });

    const chatRequests = bodies.filter((b) => Array.isArray(b.messages));
    // Two chat POSTs: the second must carry the first turn as history. (A
    // title request also goes out; it has no `messages`.)
    const followUp = chatRequests.at(-1);
    expect(followUp.messages.map((m) => m.content)).toEqual([
      "first question",
      "ok",
      "and then?",
    ]);
  });

  it("carries a turn's reasoning into the next request", async () => {
    // The API route turns a message's `thinking` into a reasoning part, so a
    // turn that is dropped from the wire loses the model's own chain of
    // thought. Nothing in the UI shows that loss — the next answer is simply
    // a little worse.
    const thinkingDelta = (text) =>
      `data: ${JSON.stringify({ choices: [{ delta: { thinking: text } }] })}\n\n`;

    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url, opts) => {
        if (opts?.body) bodies.push(JSON.parse(opts.body));
        return Promise.resolve(
          makeStreamResponse([
            thinkingDelta("I should count to three."),
            delta("One."),
            "data: [DONE]\n\n",
          ]),
        );
      }),
    );
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("count", []);
    });

    // It survives the commit...
    const committed = result.result.current.conversations.messages.find(
      (m) => m.role === "assistant",
    );
    expect(committed.thinking).toBe("I should count to three.");

    // ...and it survives into the history the next turn sends.
    await act(async () => {
      await result.result.current.stream.send("again", []);
    });

    const followUp = bodies
      .filter((b) => Array.isArray(b.messages))
      .at(-1);
    const carried = followUp.messages.find((m) => m.role === "assistant");
    expect(carried.content).toBe("One.");
    expect(carried.thinking).toBe("I should count to three.");
  });

  it("feeds the tool result back in the next round's request", async () => {
    const fetchMock = mockLoopFetch({
      chatRounds: [
        [
          toolCall(0, "call_1", "javascript_calculator", '{"expression":"2+2"}'),
          "data: [DONE]\n\n",
        ],
        [delta("The answer is 4."), usageFrame(50, 7), "data: [DONE]\n\n"],
      ],
      toolsResponse: Response.json({
        tool: "javascript_calculator",
        result: "42",
        rawResult: 42,
        sources: [],
        metadata: { expression: "2+2", success: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("what is 2+2?", []);
    });

    // Two rounds + one tool execution.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/tools");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/chat");

    // The tool endpoint got the parsed arguments.
    const toolBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(toolBody).toMatchObject({
      tool: "javascript_calculator",
      parameters: { expression: "2+2" },
    });

    // The second round's request carries the assistant tool_calls message and
    // the tool result, and every round is singleRound.
    const secondRound = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(secondRound.singleRound).toBe(true);
    expect(secondRound.messages).toHaveLength(3);
    expect(secondRound.messages[1]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "javascript_calculator",
            arguments: '{"expression":"2+2"}',
          },
        },
      ],
    });
    expect(secondRound.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
      content: "42",
    });

    // The persisted thread has one merged assistant row plus the tool record it
    // kept for context (invisible in the thread).
    const messages = result.result.current.conversations.messages;
    expect(messages).toHaveLength(3);
    expect(messages[1].content).toBe("The answer is 4.");
    expect(messages[1].tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: {
          name: "javascript_calculator",
          arguments: '{"expression":"2+2"}',
        },
      },
    ]);
    expect(messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
      content: "42",
    });
  });

  it("feeds a tool error back to the model instead of failing the turn", async () => {
    const fetchMock = mockLoopFetch({
      chatRounds: [
        [
          toolCall(0, "call_1", "javascript_calculator", '{"expression":"2+2"}'),
          "data: [DONE]\n\n",
        ],
        [delta("Could not compute."), usageFrame(50, 3), "data: [DONE]\n\n"],
      ],
      toolsResponse: Response.json({ error: "boom" }, { status: 500 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("what is 2+2?", []);
    });

    // The error is a tool message, and the loop still runs the next round.
    const secondRound = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(secondRound.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
      content: "Error: boom",
    });
    expect(finalAssistantOf(result).content).toBe("Could not compute.");
    expect(result.result.current.stream.streamingError).toBeNull();
  });

  it("runs sandbox tools via /api/sandbox and synthesizes the result frame", async () => {
    const fetchMock = mockLoopFetch({
      chatRounds: [
        [
          toolCall(0, "call_1", "execute_code", '{"code":"console.log(1)"}'),
          "data: [DONE]\n\n",
        ],
        [delta("It printed 1."), usageFrame(60, 9), "data: [DONE]\n\n"],
      ],
      sandboxResponse: Response.json({
        stdout: "1\n",
        stderr: "",
        exitCode: 0,
        sandboxId: "sbx-1",
        action: "execute",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await setup({ agentModeEnabled: true });

    await act(async () => {
      await result.result.current.stream.send("run it", []);
    });

    // The sandbox endpoint got the code and the server-side E2B key.
    const sandboxBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sandboxBody).toMatchObject({
      action: "execute",
      code: "console.log(1)",
      e2bApiKey: "e2b-test-key",
    });

    // The tool message carries the raw result.
    const secondRound = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(secondRound.messages[2].content).toBe(
      JSON.stringify({
        stdout: "1\n",
        stderr: "",
        exitCode: 0,
        sandboxId: "sbx-1",
        action: "execute",
      }),
    );

    // The synthesized sandbox_result frame reached the turn store and the
    // final message, and the conversation's sandboxId was patched.
    expect(result.result.current.stream.streamingSandboxTools).toHaveLength(1);
    expect(
      result.result.current.stream.streamingSandboxTools[0],
    ).toMatchObject({
      tool: "execute_code",
      status: "complete",
      stdout: "1\n",
      sandboxId: "sbx-1",
    });
    const finalMessage = finalAssistantOf(result);
    expect(finalMessage.sandboxResults).toHaveLength(1);
    expect(finalMessage.sandboxResults[0]).toMatchObject({
      tool: "execute_code",
      exitCode: 0,
    });
    // The sandbox output is committed as a tool record too, so the next
    // turn's request carries it.
    expect(toolRecordsOf(result)).toHaveLength(1);
    expect(JSON.parse(toolRecordsOf(result)[0].content)).toMatchObject({
      stdout: "1\n",
      exitCode: 0,
    });
    const conv = result.result.current.conversations.conversations.find(
      (c) => c.id === result.result.current.conversations.activeConversation,
    );
    expect(conv.sandboxId).toBe("sbx-1");
  });

  it("sums usage across rounds into the final message", async () => {
    const fetchMock = mockLoopFetch({
      chatRounds: [
        [
          toolCall(0, "call_1", "javascript_calculator", '{"expression":"1+1"}'),
          usageFrame(100, 5),
          "data: [DONE]\n\n",
        ],
        [delta("Two."), usageFrame(50, 7), "data: [DONE]\n\n"],
      ],
      toolsResponse: Response.json({
        tool: "javascript_calculator",
        result: "2",
        rawResult: 2,
        sources: [],
        metadata: {},
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await setup();

    await act(async () => {
      await result.result.current.stream.send("what is 1+1?", []);
    });

    const finalMessage = finalAssistantOf(result);
    expect(finalMessage.metrics.inputTokens).toBe(150);
    expect(finalMessage.metrics.outputTokens).toBe(12);
    expect(finalMessage.metrics.totalTokens).toBe(162);

    // The conversation's context usage is the summed total too.
    const conv = result.result.current.conversations.conversations.find(
      (c) => c.id === result.result.current.conversations.activeConversation,
    );
    expect(conv.contextUsage).toBe(162);
  });

  it("carries the search context into the NEXT turn's request", async () => {
    // The point of keeping tool records on the merged message: a follow-up
    // question must be answered from what the model actually read, not from
    // an answer paragraph that may have summarized it away.
    const fetchMock = mockLoopFetch({
      chatRounds: [
        [
          toolCall(0, "call_1", "web_search", '{"query":"libre office"}'),
          "data: [DONE]\n\n",
        ],
        [delta("Libre is free software."), usageFrame(50, 7), "data: [DONE]\n\n"],
        // The follow-up turn is a plain stream with no tool call.
        [delta("It ships under the MPL."), usageFrame(20, 4), "data: [DONE]\n\n"],
      ],
      toolsResponse: Response.json({
        tool: "web_search",
        result: "LibreOffice is a free and open-source office suite.",
        rawResult: {
          answer: "LibreOffice is a free and open-source office suite.",
          citations: [{ title: "libre", url: "https://libreoffice.org" }],
        },
        sources: ["https://libreoffice.org"],
        metadata: { query: "libre office", success: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await setup({ webSearchEnabled: true });

    await act(async () => {
      await result.result.current.stream.send("what is libre office?", []);
    });

    await act(async () => {
      await result.result.current.stream.send("and what license?", []);
    });

    // The last /api/chat request is the follow-up turn's: it must carry the
    // assistant tool_calls AND the search result it produced.
    const followUp = JSON.parse(
      fetchMock.mock.calls.at(-1)[1].body,
    ).messages;
    const assistantTurn = followUp.find(
      (m) => m.role === "assistant" && m.tool_calls,
    );
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn.tool_calls[0].function.name).toBe("web_search");

    const toolTurn = followUp.find((m) => m.role === "tool");
    expect(toolTurn).toBeDefined();
    expect(toolTurn.tool_call_id).toBe("call_1");
    // The search content itself — not just the answer sentence.
    expect(toolTurn.content).toContain("free and open-source office suite");

    // The tool message must follow the assistant that called it, or the
    // provider rejects the history.
    expect(
      followUp.indexOf(toolTurn),
    ).toBeGreaterThan(followUp.indexOf(assistantTurn));
  });
});
