const VALID_ROLES = new Set(["user", "assistant", "system", "tool"]);

const hasSendableContent = (message) => {
  if (message.role !== "assistant") return true;
  // UI error placeholders ({ role: "assistant", content: "", error: {...} })
  // must never be sent to the model — providers reject empty assistant text.
  if (message.error) return false;
  if (message.tool_calls) return true;
  if (typeof message.content === "string") {
    return message.content.trim() !== "" || !!message.thinking;
  }
  if (Array.isArray(message.content)) {
    return message.content.length > 0 || !!message.thinking;
  }
  return false;
};

/**
 * Return a copy of `messages` with any records that would break a chat
 * request removed (error placeholders, empty assistant turns, unknown
 * roles). Ordering and all other message shapes are preserved.
 */
export const sanitizeMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages.filter(
    (message) =>
      message && VALID_ROLES.has(message.role) && hasSendableContent(message),
  );
};
