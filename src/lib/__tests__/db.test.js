import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteConversation,
  getAllConversations,
  putConversation,
  saveAllConversations,
} from "../db";

const sample = (id, createdAt = "2024-01-01T00:00:00Z") => ({
  id,
  title: `Conv ${id}`,
  createdAt,
  messages: [],
});

afterEach(async () => {
  const all = await getAllConversations();
  await saveAllConversations([]);
});

describe("db", () => {
  it("returns an empty array when no conversations are stored", async () => {
    const all = await getAllConversations();
    expect(all).toEqual([]);
  });

  it("stores and retrieves a single conversation", async () => {
    await putConversation(sample("a"));
    const all = await getAllConversations();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("a");
  });

  it("sorts conversations by createdAt descending (newest first)", async () => {
    await putConversation(sample("a", "2023-01-01T00:00:00Z"));
    await putConversation(sample("b", "2024-06-01T00:00:00Z"));
    await putConversation(sample("c", "2024-01-15T00:00:00Z"));
    const all = await getAllConversations();
    expect(all.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("overwrites a conversation with the same id", async () => {
    await putConversation({ ...sample("a"), title: "First" });
    await putConversation({ ...sample("a"), title: "Second" });
    const all = await getAllConversations();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Second");
  });

  it("saves multiple conversations and clears existing ones", async () => {
    await putConversation(sample("a"));
    await saveAllConversations([sample("b"), sample("c")]);
    const all = await getAllConversations();
    expect(all.map((c) => c.id).sort()).toEqual(["b", "c"]);
  });

  it("deletes a conversation by id", async () => {
    await putConversation(sample("a"));
    await putConversation(sample("b"));
    await deleteConversation("a");
    const all = await getAllConversations();
    expect(all.map((c) => c.id)).toEqual(["b"]);
  });

  it("deleting a non-existent id is a no-op", async () => {
    await putConversation(sample("a"));
    await expect(deleteConversation("missing")).resolves.toBeUndefined();
    const all = await getAllConversations();
    expect(all).toHaveLength(1);
  });
});
