import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatApp from "@/components/chat/ChatApp";
import {
  conversationsRef,
  resetConversations,
} from "@/stores/conversations";
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

describe("ChatApp initial query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetConversations();
    resetTurn();
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
