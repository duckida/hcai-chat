import { describe, expect, it } from "vitest";
import { cn } from "../utils";

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", false, null, undefined, 0, "", "bar")).toBe("foo bar");
  });

  it("merges conflicting Tailwind classes (last wins for utility)", () => {
    const result = cn("px-2", "px-4");
    // tailwind-merge keeps the latter utility
    expect(result).toBe("px-4");
  });

  it("supports conditional class objects", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("supports arrays of class names", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("returns an empty string when no arguments are provided", () => {
    expect(cn()).toBe("");
  });

  it("handles complex Tailwind class conflicts", () => {
    // bg-red-500 should be overridden by bg-blue-500
    const result = cn("bg-red-500 text-white", "bg-blue-500");
    expect(result).toContain("bg-blue-500");
    expect(result).not.toContain("bg-red-500");
    expect(result).toContain("text-white");
  });
});
