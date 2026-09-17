import { describe, expect, it } from "vitest";

const toChunk = (s) => new TextEncoder().encode(s);
const delta = (content) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

const parse = (chunks) => {
  const onChunk = [];
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatchFrame = (raw) => {
    if (!raw.startsWith("data: ")) return;
    const data = raw.slice(6);
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      onChunk.push(parsed.choices?.[0]?.delta?.content || "");
    } catch {}
  };
  const flushFrames = () => {
    let start = 0;
    let idx = 0;
    while (idx < buffer.length) {
      if (buffer[idx] === "\n" && buffer[idx + 1] === "\n") {
        dispatchFrame(buffer.slice(start, idx).trim());
        start = idx + 2;
        idx += 2;
        continue;
      }
      if (buffer[idx] === "\r") {
        idx++;
        continue;
      }
      idx++;
    }
    buffer = buffer.slice(start);
  };
  for (const value of chunks) {
    buffer += decoder.decode(value, { stream: true });
    flushFrames();
  }
  buffer += decoder.decode(undefined);
  if (buffer) dispatchFrame(buffer.trim());
  return onChunk.filter(Boolean).join("");
};

describe("SSE parser (event framing)", () => {
  it("parses a single complete frame", () => {
    expect(parse([toChunk(delta("Hello "))])).toBe("Hello ");
  });

  it("parses frames split across chunks", () => {
    const json = delta("Hello");
    const mid = Math.floor(json.length / 2);
    expect(parse([toChunk(json.slice(0, mid)), toChunk(json.slice(mid))])).toBe(
      "Hello",
    );
  });

  it("parses multiple events", () => {
    const stream = delta("Hello ") + delta("World");
    expect(parse([toChunk(stream)])).toBe("Hello World");
  });

  it("parses events arriving in separate chunks", () => {
    expect(
      parse([toChunk(delta("Hello ")), toChunk(delta("World"))]),
    ).toBe("Hello World");
  });

  it("ignores keepalive comment lines", () => {
    const stream = delta("Hi") + ": keepalive\n\n" + delta(" there");
    expect(parse([toChunk(stream)])).toBe("Hi there");
  });

  it("does not discard a frame missing trailing blank line on EOF", () => {
    // No trailing \n\n — final frame still dispatched from leftover buffer.
    expect(parse([toChunk("data: " + JSON.stringify({ foo: "bar" }))])).toBe(
      "",
    );
  });

  it("tolerates \\r\\n line endings", () => {
    const stream =
      'data: ' +
      JSON.stringify({ choices: [{ delta: { content: "X" } }] }) +
      "\r\n\r\n";
    expect(parse([toChunk(stream)])).toBe("X");
  });
});
