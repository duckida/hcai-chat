export function buildToolStepMessages({
  collectedText,
  collectedToolCalls,
  collectedToolResults,
}) {
  const assistantContent = [];
  if (collectedText) {
    assistantContent.push({ type: "text", text: collectedText });
  }

  for (const toolCall of collectedToolCalls) {
    assistantContent.push({
      type: "tool-call",
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: toolCall.input ?? {},
    });
  }

  const messages = [];
  if (assistantContent.length > 0) {
    messages.push({
      role: "assistant",
      content: assistantContent,
    });
  }

  const toolResultContent = [];
  for (const toolCall of collectedToolCalls) {
    const toolResult = collectedToolResults.find(
      (result) => result.toolCallId === toolCall.toolCallId,
    );
    if (!toolResult) continue;

    const resultValue = toolResult.result ?? null;
    if (toolResult.isError) {
      const errorValue =
        typeof resultValue === "string"
          ? resultValue
          : JSON.stringify(resultValue);
      toolResultContent.push({
        type: "tool-result",
        toolCallId: toolResult.toolCallId,
        toolName: toolResult.toolName,
        output: {
          type: "error-text",
          value: errorValue,
        },
      });
      continue;
    }

    toolResultContent.push({
      type: "tool-result",
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: {
        type: "json",
        value: resultValue,
      },
    });
  }

  if (toolResultContent.length > 0) {
    messages.push({
      role: "tool",
      content: toolResultContent,
    });
  }

  return messages;
}
