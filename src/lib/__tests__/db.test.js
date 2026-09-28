import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("reuses one connection instead of reopening per call", async () => {
    // Fresh module so the cache starts empty, plus a counting stand-in for the
    // factory: exactly one open across three calls. A spy on the real factory
    // never fires here, so counting keeps the assertion honest.
    vi.resetModules();
    const fresh = await import("../db");
    const factory = globalThis.indexedDB;
    const opens = [];
    globalThis.indexedDB = {
      open: (...args) => {
        opens.push(args);
        return factory.open(...args);
      },
    };

    try {
      await fresh.getAllConversations();
      await fresh.putConversation(sample("reused"));
      await fresh.getAllConversations();
      expect(opens).toHaveLength(1);
      expect(opens[0]).toEqual(["hcai-chat", 1]);
    } finally {
      globalThis.indexedDB = factory;
      vi.resetModules();
    }
  });
});

/**
 * Write a record straight into IndexedDB, bypassing this module entirely, so
 * the data under test is exactly what an older build of the app left behind.
 */
function seedLegacy(record) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("hcai-chat", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("conversations", "readwrite");
      tx.objectStore("conversations").put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

describe("db migration", () => {
  const preAgent = {
    id: "legacy-1",
    title: "Pre-agent chat",
    createdAt: "2023-11-02T10:15:00.000Z",
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi", reasoning: "greeting" },
    ],
    model: "openai/gpt-4o-mini",
  };

  const oldest = {
    id: "legacy-2",
    title: "Even older",
    createdAt: "2023-01-01T00:00:00.000Z",
    messages: [{ role: "user", content: "first words" }],
    legacyPinned: true,
    archivedAt: "2023-02-01T00:00:00.000Z",
  };

  it("reads records written before the current schema existed", async () => {
    await seedLegacy(preAgent);
    await seedLegacy(oldest);

    const all = await getAllConversations();

    expect(all.map((c) => c.id)).toEqual(["legacy-1", "legacy-2"]);
    // Nothing was filled in, defaulted or dropped on the way out.
    expect(all[0]).toEqual(preAgent);
    expect(all[1]).toEqual(oldest);
    expect(all[0]).not.toHaveProperty("contextUsage");
    expect(all[0]).not.toHaveProperty("sandboxId");
    expect(all[0]).not.toHaveProperty("artifactPanelOpen");
  });

  it("preserves fields the current schema does not know about", async () => {
    await seedLegacy(oldest);
    const [loaded] = await getAllConversations();

    await putConversation({ ...loaded, title: "Renamed" });
    const [saved] = await getAllConversations();

    expect(saved.legacyPinned).toBe(true);
    expect(saved.archivedAt).toBe("2023-02-01T00:00:00.000Z");
    expect(saved.title).toBe("Renamed");
  });

  it("upgrades a legacy record in place without disturbing its neighbour", async () => {
    await seedLegacy(preAgent);
    await seedLegacy(oldest);
    const [first] = await getAllConversations();

    await putConversation({
      ...first,
      contextUsage: 0,
      artifactPanelOpen: false,
      sandboxId: null,
    });
    const all = await getAllConversations();

    expect(all[0]).toMatchObject({
      id: "legacy-1",
      contextUsage: 0,
      artifactPanelOpen: false,
      sandboxId: null,
    });
    expect(all[1]).toEqual(oldest);
  });
});
