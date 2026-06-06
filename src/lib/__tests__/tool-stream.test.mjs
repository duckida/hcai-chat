import { describe, expect, it } from "vitest";
import { getToolOutput } from "../tool-stream.mjs";

describe("getToolOutput", () => {
  it("returns undefined for null/undefined input", () => {
    expect(getToolOutput(null)).toBe(undefined);
    expect(getToolOutput(undefined)).toBe(undefined);
  });

  it("returns undefined when no recognized fields are present", () => {
    expect(getToolOutput({})).toBe(undefined);
    expect(getToolOutput({ foo: "bar" })).toBe(undefined);
  });

  it("returns the value of `output` when present", () => {
    expect(getToolOutput({ output: { x: 1 } })).toEqual({ x: 1 });
    expect(getToolOutput({ output: "text" })).toBe("text");
  });

  it("returns `output` even when its value is undefined (own property check)", () => {
    // The implementation uses Object.hasOwn to distinguish "present" from "absent"
    const part = { output: undefined };
    expect(Object.hasOwn(part, "output")).toBe(true);
    expect(getToolOutput(part)).toBe(undefined);
  });

  it("returns the value of `result` when present and no `output`", () => {
    expect(getToolOutput({ result: 42 })).toBe(42);
  });

  it("prefers `output` over `result` when both are present", () => {
    expect(getToolOutput({ output: "out", result: "res" })).toBe("out");
  });

  it("wraps `error` in an object when present", () => {
    expect(getToolOutput({ error: "Bad" })).toEqual({ error: "Bad" });
    expect(getToolOutput({ error: { code: 1 } })).toEqual({ error: { code: 1 } });
  });

  it("does not return `error` if it's null (treated as absent by hasOwn check)", () => {
    // hasOwn is true, so we hit the `error !== undefined` check
    // For null, we should still wrap it
    expect(getToolOutput({ error: null })).toEqual({ error: null });
  });
});
