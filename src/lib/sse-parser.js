/**
 * SSE frames are events separated by a blank line, but bytes arrive in
 * arbitrary chunks — a read can stop mid-JSON. A frame is therefore dispatched
 * only once its terminator shows up, and everything after the last boundary
 * stays buffered for the next write instead of being decoded early and lost.
 *
 * All three line-ending styles are recognised (`\n\n`, `\r\n\r\n`, `\r\r`);
 * the previous implementation only matched `\n\n`, so a CRLF-speaking server
 * would have produced an empty conversation despite the comment claiming
 * otherwise.
 */
const FRAME_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;

/**
 * Decode one raw SSE frame into an object, or null for anything that is not a
 * JSON `data:` payload: line comments, `[DONE]`, and frames cut mid-JSON by a
 * dropped connection (which cannot be salvaged and must not throw).
 */
export function parseSseFrame(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("data: ")) return null;
  const data = trimmed.slice(6);
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Feed decoded text through `onEvent` one complete frame at a time.
 *
 * @param {(event: object) => void} onEvent
 */
export function createSseParser(onEvent) {
  let buffer = "";

  const dispatch = (raw) => {
    const event = parseSseFrame(raw);
    if (event) onEvent(event);
  };

  return {
    write(text) {
      buffer += text;
      let match = FRAME_BOUNDARY.exec(buffer);
      while (match) {
        dispatch(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        match = FRAME_BOUNDARY.exec(buffer);
      }
    },

    /** Dispatch whatever the stream ended on, partial frames included. */
    end() {
      const rest = buffer;
      buffer = "";
      if (rest.trim()) dispatch(rest);
    },

    get pending() {
      return buffer;
    },
  };
}
