import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversations } from "@/hooks/use-conversations";
import * as db from "@/lib/db";

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

describe("useConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("loads conversations on mount", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
    await act(async () => {});
    expect(db.getAllConversations).toHaveBeenCalled();
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversation).toBe("conv-1");
    expect(result.current.messages).toEqual([
      { role: "user", content: "hi" },
    ]);
  });

  it("creates a new conversation with defaults", async () => {
    db.getAllConversations.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
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
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
    await act(async () => {});

    act(() => {
      result.current.newConversation();
    });
    // The send path reads this ref, so it must never hold the previous chat.
    expect(result.current.messagesRef.current).toEqual([]);
  });

  it("persists updates incrementally without rewriting the store", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
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
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
    await act(async () => {});
    expect(result.current.activeConversation).toBe("a");

    act(() => {
      result.current.deleteConversation("a");
    });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].id).toBe("b");
    expect(result.current.activeConversation).toBe("b");
    expect(db.deleteConversation).toHaveBeenCalledWith("a");
    // State transitions happen outside any updater: the active conversation
    // is set to a concrete replacement, not computed inside setConversations.
    expect(result.current.messages).toEqual(convs[1].messages);
  });

  it("falls back to an empty active conversation when the last one is deleted", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
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
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
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

    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
    await act(async () => {});

    expect(result.current.conversations).toEqual(legacy);
    expect(localStorage.getItem("conversations")).toBeNull();
    // The one legitimate full-write path: initial migration.
    expect(db.saveAllConversations).toHaveBeenCalledWith(legacy);
  });

  it("does not migrate when IndexedDB already holds data", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    localStorage.setItem("conversations", JSON.stringify([{ id: "stale" }]));

    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
    await act(async () => {});

    expect(result.current.conversations[0].id).toBe("conv-1");
    expect(db.saveAllConversations).not.toHaveBeenCalled();
  });

  it("updates the active conversation's model", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
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
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
    await act(async () => {});

    const imported = [sampleConversation({ id: "imported", title: "Imported" })];
    act(() => {
      result.current.replaceConversations(imported);
    });
    expect(result.current.conversations).toEqual(imported);
    expect(result.current.activeConversation).toBe("conv-1");
  });

  it("ignores renames with an empty title", async () => {
    db.getAllConversations.mockResolvedValue([sampleConversation()]);
    const { result } = renderHook(() =>
      useConversations({ selectedModel: "xiaomi/mimo-v2.5" }),
    );
    await act(async () => {});

    act(() => {
      result.current.renameConversation("conv-1", "  ");
    });
    expect(result.current.conversations[0].title).toBe("Test");
  });
});
