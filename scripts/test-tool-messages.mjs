import assert from "node:assert/strict";
import { buildToolStepMessages } from "../src/lib/tool-messages.mjs";

function testBuildToolStepMessages() {
  const toolCallId = "tool-call-1";
  const toolName = "web_search";
  const input = { query: "latest ai news", numResults: 2 };
  const result = {
    answer: "response",
    citations: [{ url: "https://a.example" }],
  };

  const messages = buildToolStepMessages({
    collectedText: "",
    collectedToolCalls: [{ toolCallId, toolName, input }],
    collectedToolResults: [{ toolCallId, toolName, result }],
  });

  assert.equal(messages.length, 2, "Should create assistant and tool messages");
  assert.equal(messages[0].role, "assistant");
  assert.equal(messages[1].role, "tool");

  const assistantContent = messages[0].content;
  assert.ok(
    Array.isArray(assistantContent),
    "Assistant content should be array",
  );
  assert.equal(assistantContent.length, 1);
  assert.equal(assistantContent[0].type, "tool-call");
  assert.equal(assistantContent[0].toolCallId, toolCallId);
  assert.equal(assistantContent[0].toolName, toolName);
  assert.deepEqual(assistantContent[0].input, input);

  const toolContent = messages[1].content;
  assert.ok(Array.isArray(toolContent), "Tool content should be array");
  assert.equal(toolContent.length, 1);
  assert.equal(toolContent[0].type, "tool-result");
  assert.equal(toolContent[0].toolCallId, toolCallId);
  assert.equal(toolContent[0].toolName, toolName);
  assert.deepEqual(toolContent[0].output, {
    type: "json",
    value: result,
  });
}

function testBuildToolStepMessagesWithText() {
  const toolCallId = "tool-call-2";
  const toolName = "web_search";
  const input = { query: "hello" };

  const messages = buildToolStepMessages({
    collectedText: "Let me check.",
    collectedToolCalls: [{ toolCallId, toolName, input }],
    collectedToolResults: [],
  });

  assert.equal(messages.length, 1, "Should only create assistant message");
  const assistantContent = messages[0].content;
  assert.equal(assistantContent.length, 2);
  assert.equal(assistantContent[0].type, "text");
  assert.equal(assistantContent[0].text, "Let me check.");
  assert.equal(assistantContent[1].type, "tool-call");
}

function testBuildToolStepMessagesNoContent() {
  const messages = buildToolStepMessages({
    collectedText: "",
    collectedToolCalls: [],
    collectedToolResults: [],
  });

  assert.equal(messages.length, 0, "Should return empty array");
}

testBuildToolStepMessages();
testBuildToolStepMessagesWithText();
testBuildToolStepMessagesNoContent();

console.log("tool-messages tests passed");
