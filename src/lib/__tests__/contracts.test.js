import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SETTINGS } from "@/lib/settings";

/**
 * Contracts with the user's existing browser state, not with the code.
 *
 * Everything here describes something already on people's machines: storage
 * keys they have written, an IndexedDB their conversations live in, a
 * credential that must never reach a URL. None of it fails loudly when it
 * breaks — a renamed key reads back as a default, a renamed store reads back
 * as an empty history, a key in a URL leaks into browser history and server
 * logs. So the values are pinned literally, and changing one should be a
 * deliberate edit here rather than a surprise in someone else's profile.
 */
describe("persistence contracts", () => {
  it("keeps every persisted storage key exactly as earlier versions wrote it", () => {
    expect(SETTINGS.map((s) => s.storageKey)).toEqual([
      "hack_club_ai_key",
      "e2b_api_key",
      "selected_model",
      "title_generation_model",
      "thinking_enabled",
      "artifacts_enabled",
      "web_search_enabled",
      "agent_mode_enabled",
      "show_thinking",
      "show_sandbox_code",
      "show_sandbox_output",
      "show_metrics",
      "max_tokens",
      "theme",
    ]);
  });

  it("keeps the IndexedDB name, store and key path stable", async () => {
    const { getAllConversations } = await import("@/lib/db");
    await getAllConversations();

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("hcai-chat");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect([...db.objectStoreNames]).toEqual(["conversations"]);
    expect(
      db.transaction("conversations").objectStore("conversations").keyPath,
    ).toBe("id");
    db.close();
  });
});

describe("sandbox credential handling", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("e2b_api_key", "e2b-super-secret");
    vi.restoreAllMocks();
  });

  const bodyOf = (call) => JSON.parse(call[1].body);

  it("sends the E2B key in the request body, never in a URL", async () => {
    const { fetchSandboxFiles, downloadSandboxFile } = await import(
      "@/components/chat/message/sandbox-files-client"
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "t-123" }) });
    vi.stubGlobal("fetch", fetchMock);
    // The download step navigates; jsdom cannot follow it.
    delete window.location;
    window.location = { href: "" };

    await fetchSandboxFiles("conv-1", "sbx-1");
    expect(bodyOf(fetchMock.mock.calls[0]).e2bApiKey).toBe("e2b-super-secret");

    await downloadSandboxFile("conv-1", { path: "out.txt" }, "sbx-1");
    expect(bodyOf(fetchMock.mock.calls[1]).e2bApiKey).toBe("e2b-super-secret");

    // The second step is a bare navigation carrying only the single-use token.
    const href = window.location.href;
    expect(href).toContain("action=download");
    expect(href).toContain("token=t-123");
    expect(href).not.toContain("e2b-super-secret");
    expect(fetchMock.mock.calls.every(([, init]) => !init.url)).toBe(true);
  });
});
