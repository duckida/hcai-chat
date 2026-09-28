import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "@/lib/db";
import { resetConversations, useConversations } from "@/stores/conversations";

vi.mock("@/lib/db", () => ({
  getAllConversations: vi.fn(),
  saveAllConversations: vi.fn(),
  putConversation: vi.fn(async () => {}),
  deleteConversation: vi.fn(async () => {}),
}));

const sampleConversation = (overrides = {}) => ({
  id: "conv-1",
  title: "Test",
  createdAt: "2025-01-01T00:00:00.000Z",
  messages: [{ role: "user", content: "hi" }],
  artifactPanelOpen: false,
  model: "xiaomi/mimo-v2.5",
  contextUsage: 0,
  ...overrides,
});

describe("conversations store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetConversations();
  });

  it("loads conversations on mount", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    expect(db.getAllConversations).toHaveBeenCalled();
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversation).toBe("conv-1");
    expect(result.current.messages).toEqual([
      { role: "user", content: "hi" },
    ]);
  });

  it("does not reload once hydrated", async () => {
    db.getAllConversations.mockResolvedValue([]);
    renderHook(() => useConversations());
    await act(async () => {});
    expect(db.getAllConversations).toHaveBeenCalledTimes(1);

    const { unmount } = renderHook(() => useConversations());
    await act(async () => {});
    expect(db.getAllConversations).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("creates a new conversation with defaults", async () => {
    db.getAllConversations.mockResolvedValue([]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    let created;
    act(() => {
      created = result.current.newConversation();
    });
    expect(created.id).toBeTruthy();
    expect(created.title).toBe("New Chat");
    expect(created.model).toBe("xiaomi/mimo-v2.5");
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversation).toBe(created.id);
    // A new conversation is written incrementally, not via a full rewrite.
    expect(db.putConversation).toHaveBeenCalled();
    expect(db.saveAllConversations).not.toHaveBeenCalled();
  });

  it("assigns messagesRef synchronously on creation", async () => {
    db.getAllConversations.mockResolvedValue([
      sampleConversation({
        id: "old",
        messages: [{ role: "user", content: "old chat content" }],
      }),
    ]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.newConversation();
    });
    // The send path reads this ref, so it must never hold the previous chat.
    expect(result.current.messagesRef.current).toEqual([]);
  });

  it("persists updates incrementally without rewriting the store", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.renameConversation("conv-1", "Renamed");
    });
    expect(result.current.conversations[0].title).toBe("Renamed");
    expect(db.putConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conv-1", title: "Renamed" }),
    );
    expect(db.saveAllConversations).not.toHaveBeenCalled();
  });

  it("deletes a conversation and replaces the active one", async () => {
    const convs = [
      sampleConversation({ id: "a", createdAt: "2025-01-02T00:00:00.000Z" }),
      sampleConversation({ id: "b", createdAt: "2025-01-01T00:00:00.000Z" }),
    ];
    db.getAllConversations.mockResolvedValue(convs);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});
    expect(result.current.activeConversation).toBe("a");

    act(() => {
      result.current.deleteConversation("a");
    });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].id).toBe("b");
    expect(result.current.activeConversation).toBe("b");
    expect(db.deleteConversation).toHaveBeenCalledWith("a");
    expect(result.current.messages).toEqual(convs[1].messages);
  });

  it("keeps the conversation on screen when a background row is deleted", async () => {
    const convs = [
      sampleConversation({ id: "a", createdAt: "2025-01-02T00:00:00.000Z" }),
      sampleConversation({
        id: "b",
        createdAt: "2025-01-01T00:00:00.000Z",
        messages: [{ role: "user", content: "b content" }],
      }),
    ];
    db.getAllConversations.mockResolvedValue(convs);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});
    expect(result.current.activeConversation).toBe("a");

    act(() => {
      result.current.deleteConversation("b");
    });
    expect(result.current.activeConversation).toBe("a");
    expect(result.current.messages).toEqual(convs[0].messages);
    expect(db.deleteConversation).toHaveBeenCalledWith("b");
  });

  it("falls back to an empty active conversation when the last one is deleted", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.deleteConversation("conv-1");
    });
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversation).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  it("selects a conversation and syncs its messages", async () => {
    const convs = [
      sampleConversation({ id: "a", createdAt: "2025-01-02T00:00:00.000Z" }),
      sampleConversation({
        id: "b",
        createdAt: "2025-01-01T00:00:00.000Z",
        messages: [{ role: "user", content: "b content" }],
      }),
    ];
    db.getAllConversations.mockResolvedValue(convs);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.selectConversation("b");
    });
    expect(result.current.activeConversation).toBe("b");
    expect(result.current.messages).toEqual([
      { role: "user", content: "b content" },
    ]);
    expect(result.current.messagesRef.current).toEqual([
      { role: "user", content: "b content" },
    ]);
  });

  it("migrates legacy localStorage conversations once", async () => {
    db.getAllConversations.mockResolvedValue([]);
    const legacy = [sampleConversation()];
    localStorage.setItem("conversations", JSON.stringify(legacy));

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    expect(result.current.conversations).toEqual(legacy);
    expect(localStorage.getItem("conversations")).toBeNull();
    // The one legitimate full-write path: initial migration.
    expect(db.saveAllConversations).toHaveBeenCalledWith(legacy);
  });

  it("migrates records that predate the current schema", async () => {
    db.getAllConversations.mockResolvedValue([]);
    const legacy = [
      {
        id: "ancient",
        title: "Old chat",
        createdAt: "2023-05-04T00:00:00.000Z",
        messages: [{ role: "user", content: "from another era" }],
      },
    ];
    localStorage.setItem("conversations", JSON.stringify(legacy));

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    expect(result.current.conversations[0]).toEqual(legacy[0]);
    expect(result.current.activeConversation).toBe("ancient");
    expect(result.current.messages).toEqual(legacy[0].messages);
    expect(db.saveAllConversations).toHaveBeenCalledWith(legacy);
  });

  it("does not migrate when IndexedDB already holds data", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    localStorage.setItem("conversations", JSON.stringify([{ id: "stale" }]));

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    expect(result.current.conversations[0].id).toBe("conv-1");
    expect(db.saveAllConversations).not.toHaveBeenCalled();
  });

  it("survives a corrupt legacy payload and still hydrates", async () => {
    db.getAllConversations.mockResolvedValue([]);
    localStorage.setItem("conversations", "{not json");

    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    expect(result.current.conversations).toEqual([]);
    expect(result.current.hydrated).toBe(true);
  });

  it("updates the active conversation's model", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.setConversationModel("qwen/qwen3.6-flash");
    });
    expect(result.current.conversations[0].model).toBe("qwen/qwen3.6-flash");
    expect(db.putConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conv-1",
        model: "qwen/qwen3.6-flash",
      }),
    );
  });

  it("replaces the whole list after an import", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    const imported = [sampleConversation({ id: "imported", title: "Imported" })];
    act(() => {
      result.current.replaceConversations(imported);
    });
    expect(result.current.conversations).toEqual(imported);
    // The refresh dropped conv-1, so the view follows it rather than
    // leaving an id the sidebar no longer has.
    expect(result.current.activeConversation).toBe("imported");
    expect(result.current.messages).toEqual(imported[0].messages);
  });

  it("keeps the current conversation through a refresh that still contains it", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    const refreshed = [
      sampleConversation({ title: "Renamed upstream" }),
      sampleConversation({ id: "other" }),
    ];
    act(() => {
      result.current.replaceConversations(refreshed);
    });
    expect(result.current.activeConversation).toBe("conv-1");
    expect(result.current.messages).toEqual(refreshed[0].messages);
  });

  it("ignores renames with an empty title", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.renameConversation("conv-1", "  ");
    });
    expect(result.current.conversations[0].title).toBe("Test");
  });

  it("never rewrites the whole store on a single change", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() => useConversations());
    await act(async () => {});

    act(() => {
      result.current.setMessages([{ role: "assistant", content: "ok" }]);
    });
    expect(result.current.messages).toEqual([
      { role: "assistant", content: "ok" },
    ]);
    expect(db.saveAllConversations).not.toHaveBeenCalled();
    expect(db.putConversation).not.toHaveBeenCalled();
  });
});
