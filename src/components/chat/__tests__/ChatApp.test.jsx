import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatApp from "@/components/chat/ChatApp";
import { useChatTurn } from "@/hooks/use-chat-turn";
import {
  conversationsRef,
  resetConversations,
} from "@/stores/conversations";
import { resetModels } from "@/stores/models";
import {
  resetSettings,
  setSetting,
  settingsStore,
} from "@/stores/settings";
import { resetTurn } from "@/stores/turn";

const EXISTING_ID = "conv-existing";
const EXISTING_MESSAGE = {
  role: "user",
  content: "an unrelated earlier conversation",
};

vi.mock("@/lib/db", () => ({
  getAllConversations: vi.fn(async () => [
    {
      id: "conv-existing",
      title: "Earlier chat",
      createdAt: new Date().toISOString(),
      messages: [
        { role: "user", content: "an unrelated earlier conversation" },
      ],
      artifactPanelOpen: false,
      model: "xiaomi/mimo-v2.5",
      contextUsage: 0,
    },
  ]),
  saveAllConversations: vi.fn(async () => {}),
  putConversation: vi.fn(async () => {}),
  deleteConversation: vi.fn(async () => {}),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual("@/lib/api-client");
  return {
    ...actual,
    generateTitle: vi.fn(async () => "Generated Title"),
  };
});

const encoder = new TextEncoder();
const delta = (content) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

function streamResponse(text) {
  const chunks = [delta(text), "data: [DONE]\n\n"];
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index >= chunks.length
            ? { done: true, value: undefined }
            : { done: false, value: encoder.encode(chunks[index++]) },
      }),
    },
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (typeof url === "string" && url.includes("/api/chat")) {
        return streamResponse("search answer");
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ models: [] }),
      };
    }),
  );
}

/**
 * A `/api/models` response for the given catalog rows.
 *
 * Tool support is derived from `supported_parameters`, and ChatApp loads the
 * catalog on mount — so this, not a direct store write, is what decides whether
 * a model can call tools.
 */
function stubCatalog(rows) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (typeof url === "string" && url.includes("/api/chat")) {
        return streamResponse("ok");
      }
      if (typeof url === "string" && url.includes("/api/models")) {
        return { ok: true, status: 200, json: async () => ({ data: rows }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
}

describe("ChatApp initial query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetConversations();
    resetTurn();
    resetSettings();
    localStorage.setItem("hack_club_ai_key", "sk-hc-test-key");
    stubFetch();
  });

  it("opens its own chat instead of appending to the restored one", async () => {
    render(<ChatApp initialQuery="deep learning" />);

    await waitFor(
      () => {
        expect(conversationsRef.current).toHaveLength(2);
      },
      { timeout: 5000 },
    );

    const restored = conversationsRef.current.find(
      (c) => c.id === EXISTING_ID,
    );
    expect(restored.messages).toEqual([EXISTING_MESSAGE]);

    const opened = conversationsRef.current.find((c) => c.id !== EXISTING_ID);
    expect(opened.messages[0]).toEqual({ role: "user", content: "deep learning" });

    await waitFor(
      () => {
        expect(
          conversationsRef.current.find((c) => c.id !== EXISTING_ID).messages,
        ).toHaveLength(2);
      },
      { timeout: 5000 },
    );
  });
});

// Tool-backed features must not be offered by a model that cannot call tools.
// Both halves matter: the button has to be visibly unavailable, and the stored
// setting has to be forced off — a disabled control that still reports "on"
// leaves a request going out with a tool the model will never call (396a4f3).
describe("tool support gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetConversations();
    resetTurn();
    resetSettings();
    resetModels();
    localStorage.setItem("hack_club_ai_key", "sk-hc-test-key");
    // Agent mode is blocked by two different things; with a key present, tool
    // support is the only one left, so the tooltip can be attributed.
    localStorage.setItem("e2b_api_key", "e2b-test-key");
    stubFetch();
  });

  it("turns web search and agent mode off when the model cannot call tools", async () => {
    // Both are persisted as on, as they would be if the user had just switched
    // from a tool-capable model to one that has no tool support at all.
    setSetting("webSearchEnabled", true);
    setSetting("agentModeEnabled", true);
    setSetting("selectedModel", "some/limited-model");
    stubCatalog([
      { id: "some/limited-model", supported_parameters: ["max_tokens"] },
    ]);

    render(<ChatApp />);

    await waitFor(() => {
      expect(settingsStore.getState().webSearchEnabled).toBe(false);
      expect(settingsStore.getState().agentModeEnabled).toBe(false);
    });
    // Forced off in storage too, so the flag does not come back on reload.
    expect(localStorage.getItem("web_search_enabled")).not.toBe("true");
  });

  it("disables the toggles in the header for a model without tool support", async () => {
    setSetting("selectedModel", "some/limited-model");
    // The catalog is what decides tool support, and ChatApp loads it on mount —
    // seeding the store directly is overwritten by the load a tick later, which
    // is how this test first "passed" against a live, enabled button.
    stubCatalog([
      { id: "some/limited-model", supported_parameters: ["max_tokens"] },
    ]);

    render(<ChatApp />);

    // Re-queried inside the assertion, not captured once: React replaces the
    // node when the catalog arrives, and a captured reference is then a
    // detached button that reports neither disabled nor enabled. The
    // accessible name follows the tooltip, which is the point — a control that
    // refuses to work has to say why.
    await waitFor(() => {
      const blocked = screen.getAllByRole("button", {
        name: "Not supported by current model",
      });
      // Web search and agent mode both lose tool backing here.
      expect(blocked).toHaveLength(2);
      for (const button of blocked) {
        // RAC applies the native `disabled` attribute to a <button>, not
        // aria-disabled, so the control is genuinely inert to pointer and
        // keyboard rather than merely styled to look off.
        expect(button).toBeDisabled();
      }
    });
  });
});

// Web search and artifacts are independent capabilities. Making them mutually
// exclusive was a bug: a user who turned on artifacts lost search, and vice
// versa (a2e4c60).
describe("web search and artifacts are independent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetConversations();
    resetTurn();
    resetSettings();
    resetModels();
    localStorage.setItem("hack_club_ai_key", "sk-hc-test-key");
    stubFetch();
  });

  it("keeps both on when both are switched on", () => {
    setSetting("artifactsEnabled", true);
    setSetting("webSearchEnabled", true);

    const state = settingsStore.getState();
    expect(state.artifactsEnabled).toBe(true);
    expect(state.webSearchEnabled).toBe(true);
  });

  it("sends both capabilities to the model for one request", async () => {
    // The toggles being on is the UI half; the request carrying both is the
    // half that actually changes behaviour.
    const { result } = renderHook(() => useChatTurn({
      selectedModel: "qwen/qwen3.6-flash",
      titleGenerationModel: "qwen/qwen3.6-flash",
      thinkingLevel: "off",
      artifactsEnabled: true,
      webSearchEnabled: true,
      agentModeEnabled: false,
      maxTokens: 1000,
      toolsSupported: true,
      isDesktop: true,
    }));
    await act(async () => {});

    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url, opts) => {
        if (opts?.body) bodies.push(JSON.parse(opts.body));
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => ({ done: true, value: undefined }),
            }),
          },
        };
      }),
    );

    await act(async () => {
      await result.current.send("find me something", []);
    });

    const request = bodies.find((b) => Array.isArray(b.messages));
    expect(request.artifacts).toBe(true);
    // web_search is in the tool list the request advertises.
    expect(request.tools.map((t) => t.function.name)).toContain("web_search");
  });
});

// The outage dialog is the only thing standing between a user with no balance
// and a chat that cannot answer anything, so it has to offer a way out.
describe("balance outage dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetConversations();
    resetTurn();
    resetSettings();
    resetModels();
    localStorage.setItem("hack_club_ai_key", "sk-hc-test-key");
  });

  it("offers the free fallback and switches to it on request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (typeof url === "string" && url.includes("/api/balance")) {
          return { ok: true, status: 200, json: async () => ({ balanceRemaining: -1 }) };
        }
        if (typeof url === "string" && url.includes("/api/pricing")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ "xiaomi/mimo-v2.5": { input: 1, output: 2 } }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ models: [] }) };
      }),
    );

    render(<ChatApp />);

    const use = await screen.findByRole("button", { name: /use it/i });
    expect(
      await screen.findByText(/openrouter\/free/i, { exact: false }),
    ).toBeInTheDocument();

    await userEvent.click(use);

    await waitFor(() => {
      expect(settingsStore.getState().selectedModel).toBe("openrouter/free");
    });
  });

  it("stays shut when the balance is fine", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (typeof url === "string" && url.includes("/api/balance")) {
          return { ok: true, status: 200, json: async () => ({ balanceRemaining: 5 }) };
        }
        return { ok: true, status: 200, json: async () => ({ models: [] }) };
      }),
    );

    render(<ChatApp />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /use it/i })).toBeNull();
    });
  });
});
