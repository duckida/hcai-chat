import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import { setStoredApiKey } from "@/lib/api-client";
import { getInlineViewEntry, inlineViewKey, resetInlineViewCache } from "@/lib/inline-view-cache";
import { resetInlineViewFontCache } from "@/lib/inline-view-font";
import { conversationsStore, resetConversations } from "@/stores/conversations";
import { resetSettings, settingsStore } from "@/stores/settings";
import { readTurnDeltas, resetTurn, turnStore } from "@/stores/turn";
import Message from "../Message";

const upstream = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      return { chat: { completions: { create: upstream.create } } };
    }
  },
}));

function responseStream(html) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { reasoning: "Building the chart" } }] };
      yield { choices: [{ delta: { content: html } }] };
      yield {
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15, cost: 0.001 },
      };
    },
  };
}

beforeEach(() => {
  resetSettings();
  resetTurn();
  resetConversations();
  resetInlineViewCache();
  resetInlineViewFontCache();
  localStorage.clear();
  setStoredApiKey("test-key");
  settingsStore.setState({
    inlineViewFrequency: "sometimes",
    inlineViewFormat: "json-render",
    inlineViewModel: "qwen/qwen3.6-flash",
    openRouterProviders: { "qwen/qwen3.6-flash": "alibaba/fp8" },
  });
  upstream.create.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    expect(url).toBe("/api/chat");
    return POST({ json: async () => JSON.parse(options.body) });
  }));
});

describe("description view generation", () => {
  it("runs a saved brief through the real route, stream parser, cache and sandboxed frame", async () => {
    const html = '<div class="hcai-view">Completed chart</div>';
    upstream.create.mockResolvedValue(responseStream(html));
    turnStore.setState({ streamingContent: "A separate chat answer", streamingThinking: "Separate reasoning" });
    const turnBefore = turnStore.getState();
    const conversationsBefore = conversationsStore.getState();
    const message = {
      role: "assistant",
      content: 'Before\n<inline title="Rainfall" format="json-render">A chart of monthly rainfall</inline>\nAfter',
    };
    const view = render(<Message message={message} />);

    const frame = await screen.findByTitle("Rainfall");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain(html);
    expect(document.querySelector(".msg-row")).toHaveTextContent("BeforeAfter");
    expect(turnStore.getState()).toBe(turnBefore);
    expect(conversationsStore.getState()).toBe(conversationsBefore);
    expect(readTurnDeltas()).toEqual({ content: "", thinking: "" });

    const params = upstream.create.mock.calls[0][0];
    expect(params.stream).toBe(true);
    expect(params.provider).toEqual({ only: ["alibaba/fp8"] });
    expect(params.reasoning).toEqual({ enabled: true, exclude: false });
    expect(params.messages).toHaveLength(2);
    expect(params.messages[0].content).toContain("You build one small, self-contained HTML visual");
    expect(params.messages[0].content).not.toContain("## Inline Views");
    expect(params.messages[1]).toEqual({ role: "user", content: "A chart of monthly rainfall" });

    const key = inlineViewKey("A chart of monthly rainfall");
    expect(getInlineViewEntry(key)).toEqual({ status: "ready", html });
    expect(JSON.parse(localStorage.getItem("hcai_inline_view_cache"))[key]).toBe(html);
    view.unmount();
    render(<Message message={message} />);
    expect(screen.getByTitle("Rainfall").getAttribute("srcdoc")).toContain(html);
    expect(upstream.create).toHaveBeenCalledTimes(1);
  });

  it("shows the builder error and retries through the same pipeline", async () => {
    const user = userEvent.setup();
    upstream.create.mockRejectedValueOnce(new Error("Builder unavailable"));
    upstream.create.mockResolvedValueOnce(responseStream("<div>Recovered chart</div>"));
    render(<Message message={{ role: "assistant", content: '<inline title="Retry">A chart</inline>' }} />);

    expect(await screen.findByText(/couldn't generate this view/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Retry")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findByTitle("Retry")).getAttribute("srcdoc")).toContain("Recovered chart");
    expect(upstream.create).toHaveBeenCalledTimes(2);
  });
});
