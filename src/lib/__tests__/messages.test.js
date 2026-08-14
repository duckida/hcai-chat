import { describe, expect, it } from "vitest";
import { sanitizeMessages } from "../messages";

describe("sanitizeMessages", () => {
  it("returns an empty array for non-array input", () => {
    expect(sanitizeMessages(null)).toEqual([]);
    expect(sanitizeMessages(undefined)).toEqual([]);
    expect(sanitizeMessages("nope")).toEqual([]);
  });

  it("preserves a clean conversation unchanged", () => {
    const messages = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "hello",
        thinking: "some reasoning",
        metrics: { cost: 0.01 },
      },
      { role: "user", content: [{ type: "text", text: "again" }] },
    ];
    expect(sanitizeMessages(messages)).toEqual(messages);
  });

  it("drops assistant error placeholders", () => {
    const messages = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "",
        error: { title: "API Error", details: "boom" },
      },
      { role: "user", content: "still here" },
    ];
    expect(sanitizeMessages(messages)).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "still here" },
    ]);
  });

  it("drops assistant messages with empty content and no thinking", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "" },
      { role: "assistant", content: "   " },
      { role: "assistant" },
      { role: "user", content: "still here" },
    ];
    const cleaned = sanitizeMessages(messages);
    expect(cleaned).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "still here" },
    ]);
  });

  it("keeps assistant messages that only have thinking or tool_calls", () => {
    const thinkingOnly = { role: "assistant", content: "", thinking: "hmm" };
    const toolCallsOnly = {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "call_1", function: { name: "web_search" } }],
    };
    const cleaned = sanitizeMessages([
      { role: "user", content: "hi" },
      thinkingOnly,
      toolCallsOnly,
    ]);
    expect(cleaned).toEqual([
      { role: "user", content: "hi" },
      thinkingOnly,
      toolCallsOnly,
    ]);
  });

  it("drops messages with unknown roles and null entries", () => {
    const messages = [
      { role: "user", content: "hi" },
      null,
      { role: "robot", content: "beep" },
      { content: "no role" },
      { role: "assistant", content: "ok" },
    ];
    expect(sanitizeMessages(messages)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" },
    ]);
  });

  it("preserves system and tool messages", () => {
    const messages = [
      { role: "system", content: "be helpful" },
      { role: "tool", content: [{ type: "tool-result" }], tool_call_id: "x" },
    ];
    expect(sanitizeMessages(messages)).toEqual(messages);
  });

  it("drops an assistant error placeholder even when it has other fields", () => {
    const messages = [
      {
        role: "assistant",
        content: "",
        error: { title: "API Error", details: "nope" },
        thinking: "partial thought",
      },
    ];
    expect(sanitizeMessages(messages)).toEqual([]);
  });
});