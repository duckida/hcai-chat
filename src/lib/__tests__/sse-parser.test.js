import { describe, expect, it } from "vitest";
import {
  createSseParser,
  parseSseFrame,
  SSE_DONE,
} from "@/lib/sse-parser";

const toChunk = (s) => new TextEncoder().encode(s);

const delta = (content) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

const parse = (chunks) => {
  const seen = [];
  const parser = createSseParser((event) => {
    seen.push(event.choices?.[0]?.delta?.content || "");
  });
  const decoder = new TextDecoder();
  for (const bytes of chunks) {
    parser.write(decoder.decode(bytes, { stream: true }));
  }
  parser.write(decoder.decode());
  parser.end();
  return seen.filter(Boolean).join("");
};

describe("sse-parser frame splitting", () => {
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
    // No trailing \n\n — the leftover buffer is still dispatched by end().
    expect(parse([toChunk("data: " + JSON.stringify({ foo: "bar" }))])).toBe(
      "",
    );
  });

  it("tolerates \\r\\n line endings", () => {
    const stream =
      "data: " +
      JSON.stringify({ choices: [{ delta: { content: "X" } }] }) +
      "\r\n\r\n";
    expect(parse([toChunk(stream)])).toBe("X");
  });

  it("splits several CRLF-terminated frames in one buffer", () => {
    const crlf = (content) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`;
    // The old boundary check only looked for \n\n, so this decoded to nothing.
    expect(parse([toChunk(crlf("one") + crlf("two"))])).toBe("onetwo");
  });

  it("splits CR-only frame boundaries", () => {
    const cr = (content) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\r`;
    expect(parse([toChunk(cr("a") + cr("b"))])).toBe("ab");
  });

  it("keeps a complete frame that precedes a truncated one at EOF", () => {
    // Verified against the previous scanner too: it also passes, because
    // flushFrames runs on every read. Pinned here so the EOF path cannot
    // regress into dispatching the whole leftover buffer as one frame.
    const complete = delta("kept");
    const truncated = 'data: {"choices": [{"delta": {"content": "cut';
    expect(parse([toChunk(complete + truncated)])).toBe("kept");
  });
});

describe("sse-parser buffering", () => {
  it("holds a partial frame until its boundary arrives", () => {
    const events = [];
    const parser = createSseParser((event) => events.push(event));

    parser.write(delta("Hel").slice(0, -4));
    expect(events).toHaveLength(0);
    expect(parser.pending).not.toBe("");

    parser.write(delta("Hel").slice(-4));
    expect(events).toHaveLength(1);
    expect(events[0].choices[0].delta.content).toBe("Hel");
  });

  it("dispatches the final frame even without a trailing blank line", () => {
    const events = [];
    const parser = createSseParser((event) => events.push(event));

    parser.write(delta("tail").trimEnd());
    expect(events).toHaveLength(0);

    parser.end();
    expect(events).toHaveLength(1);
    expect(events[0].choices[0].delta.content).toBe("tail");
    expect(parser.pending).toBe("");
  });
});

describe("parseSseFrame", () => {
  it("decodes a data payload", () => {
    expect(parseSseFrame('data: {"type":"usage","usage":{}}')).toEqual({
      type: "usage",
      usage: {},
    });
  });

  it("returns null for anything that is not a decodable data frame", () => {
    expect(parseSseFrame(": keepalive comment")).toBeNull();
    expect(parseSseFrame("event: message")).toBeNull();
    expect(parseSseFrame("")).toBeNull();
    expect(parseSseFrame("   ")).toBeNull();
    // Cut mid-JSON by a dropped connection: cannot be salvaged, must not throw.
    expect(parseSseFrame('data: {"choices": [')).toBeNull();
  });

  it("decodes [DONE] as the completion event, not null", () => {
    // The reader must be able to tell "the server finished" from "the bytes
    // stopped" — dropping the marker is how a connection cut mid-answer used
    // to be committed as a complete response.
    expect(parseSseFrame("data: [DONE]")).toBe(SSE_DONE);
    expect(parseSseFrame("data: [DONE]\n")).toBe(SSE_DONE);
  });

  it("dispatches the completion event through the parser", () => {
    const events = [];
    const parser = createSseParser((event) => events.push(event));
    parser.write("data: [DONE]\n\n");
    expect(events).toEqual([SSE_DONE]);
  });
});
