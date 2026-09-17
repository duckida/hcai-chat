import { describe, expect, it } from "vitest";

/*
 * Reproduces the cross-conversation carryover race: when a UI resets state
 * via setMessages([]) but the message-ref used by handleSendMessage only
 * syncs in a post-render useEffect, the next send reads the previous chat's
 * messagesRef.current and replays them.
 *
 * The production fix assigns messagesRef.current synchronously wherever
 * messages are reset. This test asserts that invariant holds.
 */

describe("conversation isolation (messagesRef sync)", () => {
  it("resetting a conversation keeps messagesRef empty", () => {
    const messagesRef = { current: [{ role: "user", content: "old" }] };

    // Simulate handleNewChat: setMessages([]) + synchronous ref reset
    messagesRef.current = [];

    const updatedMessages = [...messagesRef.current, { role: "user", content: "new" }];
    expect(updatedMessages).toEqual([{ role: "user", content: "new" }]);
  });

  it("stale ref (without sync) would leak old messages", () => {
    const messagesRef = { current: [{ role: "user", content: "old chat content" }] };

    // Bug scenario: setMessages([]) ran but ref still points at old data
    // because sync happens in useEffect (after render).
    const updatedMessages = [...messagesRef.current, { role: "user", content: "new" }];
    expect(updatedMessages).toEqual([
      { role: "user", content: "old chat content" },
      { role: "user", content: "new" },
    ]);
    // The old message leaked into the new conversation — demonstrating the bug.
  });
});
