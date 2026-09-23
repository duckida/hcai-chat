const VALID_ROLES = new Set(["user", "assistant", "system", "tool"]);

/**
 * Extract plain text from a message body that may be a string or an array
 * of content parts (text / image / file attachments).
 */
export function getMessageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

/**
 * First text part of a user message — used for previews and attachment
 * summaries, where concatenated multi-part text is not needed.
 */
export function getUserText(content) {
  if (typeof content === "string") return content;
  if (
    Array.isArray(content) &&
    content.length > 0 &&
    content[0].type === "text"
  ) {
    return content[0].text;
  }
  return "";
}

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

const hasRenderablePart = (part) => {
  if (!part || typeof part !== "object") return false;
  if (part.type === "text") return !!part.text?.trim();
  if (part.type === "image") return !!part.image;
  if (part.type === "file") return !!(part.data && part.filename);
  return false;
};

/**
 * Whether a persisted message should occupy space in the rendered list.
 * Tool records and empty turns are skipped; error placeholders render as
 * an inline error card instead. A message must contain at least one part
 * the renderer can actually display — array length alone is not enough,
 * or payload-less parts (e.g. a failed image upload) render an avatar
 * with an empty body.
 */
export function hasRenderableContent(message) {
  if (message.role === "user") {
    if (typeof message.content === "string" && message.content.trim())
      return true;
    if (message._files && message._files.length > 0) return true;
    if (Array.isArray(message.content))
      return message.content.some(hasRenderablePart);
    return false;
  }
  if (message.role === "tool") return false;
  if (message.error) return true;
  const messageText =
    typeof message.content === "string"
      ? message.content
      : getMessageText(message.content);
  if (messageText.trim() !== "") return true;
  if (message.thinking && message.thinking.trim() !== "") return true;
  return false;
}
