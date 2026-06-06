import { describe, expect, it } from "vitest";
import { buildToolStepMessages } from "../tool-messages.mjs";

describe("buildToolStepMessages", () => {
  it("returns empty messages when nothing is collected", () => {
    expect(
      buildToolStepMessages({
        collectedText: "",
        collectedToolCalls: [],
        collectedToolResults: [],
      }),
    ).toEqual([]);
  });

  it("builds a single assistant text message when only text is collected", () => {
    const messages = buildToolStepMessages({
      collectedText: "Hello world",
      collectedToolCalls: [],
      collectedToolResults: [],
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Hello world" }],
    });
  });

  it("builds assistant + tool messages for a tool call with a result", () => {
    const messages = buildToolStepMessages({
      collectedText: "",
      collectedToolCalls: [
        { toolCallId: "t1", toolName: "web_search", input: { q: "hi" } },
      ],
      collectedToolResults: [
        { toolCallId: "t1", toolName: "web_search", result: { answer: "ok" } },
      ],
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content[0]).toEqual({
      type: "tool-call",
      toolCallId: "t1",
      toolName: "web_search",
      input: { q: "hi" },
    });
    expect(messages[1].role).toBe("tool");
    expect(messages[1].content[0]).toEqual({
      type: "tool-result",
      toolCallId: "t1",
      toolName: "web_search",
      output: { type: "json", value: { answer: "ok" } },
    });
  });

  it("uses `error-text` output for isError results", () => {
    const messages = buildToolStepMessages({
      collectedText: "",
      collectedToolCalls: [
        { toolCallId: "t1", toolName: "web_search", input: {} },
      ],
      collectedToolResults: [
        { toolCallId: "t1", toolName: "web_search", result: "Bad", isError: true },
      ],
    });
    expect(messages[1].content[0].output).toEqual({
      type: "error-text",
      value: "Bad",
    });
  });

  it("stringifies non-string error results", () => {
    const messages = buildToolStepMessages({
      collectedText: "",
      collectedToolCalls: [
        { toolCallId: "t1", toolName: "web_search", input: {} },
      ],
      collectedToolResults: [
        { toolCallId: "t1", toolName: "web_search", result: { code: 1 }, isError: true },
      ],
    });
    expect(messages[1].content[0].output.value).toBe('{"code":1}');
  });

  it("skips tool calls with no matching result", () => {
    const messages = buildToolStepMessages({
      collectedText: "",
      collectedToolCalls: [
        { toolCallId: "t1", toolName: "web_search", input: {} },
        { toolCallId: "t2", toolName: "javascript_calculator", input: {} },
      ],
      collectedToolResults: [
        { toolCallId: "t1", toolName: "web_search", result: "ok" },
      ],
    });
    // The tool message exists (with the t1 result), but only contains t1 (not t2)
    const toolMsg = messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg.content).toHaveLength(1);
    expect(toolMsg.content[0].toolCallId).toBe("t1");
  });

  it("defaults missing input to an empty object", () => {
    const messages = buildToolStepMessages({
      collectedText: "",
      collectedToolCalls: [
        { toolCallId: "t1", toolName: "x" },
      ],
      collectedToolResults: [],
    });
    expect(messages[0].content[0].input).toEqual({});
  });

  it("combines text + tool calls in a single assistant message", () => {
    const messages = buildToolStepMessages({
      collectedText: "I am calling a tool",
      collectedToolCalls: [
        { toolCallId: "t1", toolName: "web_search", input: { q: "x" } },
      ],
      collectedToolResults: [
        { toolCallId: "t1", toolName: "web_search", result: "answer" },
      ],
    });
    expect(messages[0].content).toEqual([
      { type: "text", text: "I am calling a tool" },
      {
        type: "tool-call",
        toolCallId: "t1",
        toolName: "web_search",
        input: { q: "x" },
      },
    ]);
    expect(messages[1].role).toBe("tool");
  });

  it("handles null result values in successful results", () => {
    const messages = buildToolStepMessages({
      collectedText: "",
      collectedToolCalls: [
        { toolCallId: "t1", toolName: "x", input: {} },
      ],
      collectedToolResults: [
        { toolCallId: "t1", toolName: "x", result: null },
      ],
    });
    expect(messages[1].content[0].output).toEqual({
      type: "json",
      value: null,
    });
  });
});
