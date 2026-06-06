import { describe, expect, it } from "vitest";
import { normalizeLatexDelimiters } from "../latex";

describe("normalizeLatexDelimiters", () => {
  it("returns falsy or non-string input unchanged", () => {
    expect(normalizeLatexDelimiters(null)).toBe(null);
    expect(normalizeLatexDelimiters(undefined)).toBe(undefined);
    expect(normalizeLatexDelimiters(42)).toBe(42);
    expect(normalizeLatexDelimiters("")).toBe("");
  });

  it("returns text without math delimiters unchanged", () => {
    const text = "Just a regular sentence with no math.";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });

  it("converts \\[ ... \\] to $$ ... $$ blocks", () => {
    const input = "Some text \\[x^2 + y^2 = z^2\\] more text";
    const output = normalizeLatexDelimiters(input);
    expect(output).toContain("$$\nx^2 + y^2 = z^2\n$$");
    expect(output).not.toContain("\\[");
    expect(output).not.toContain("\\]");
  });

  it("converts [...] wrapped aligned environments to $$ ... $$", () => {
    const input = "[\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}]";
    const output = normalizeLatexDelimiters(input);
    expect(output).toContain("$$");
    expect(output).toContain("\\begin{aligned}");
    expect(output).toContain("\\end{aligned}");
  });

  it("converts single-line \\( ... \\) to inline $$...$$", () => {
    const input = "This is \\(a + b\\) inline.";
    const output = normalizeLatexDelimiters(input);
    expect(output).toContain("$$a + b$$");
    expect(output).not.toContain("\\(");
    expect(output).not.toContain("\\)");
  });

  it("does not match \\( ... \\) across newlines", () => {
    const input = "Outside \\(a \n + b\\) outside";
    const output = normalizeLatexDelimiters(input);
    // The single-line match should NOT consume across \n
    expect(output).toContain("\\(a");
  });

  it("normalizes bare \\begin{aligned} ... \\end{aligned} into $$ ... $$", () => {
    const input = "\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}";
    const output = normalizeLatexDelimiters(input);
    expect(output.startsWith("$$")).toBe(true);
    expect(output.endsWith("$$")).toBe(true);
  });

  it("normalizes bare \\begin{align} ... \\end{align} into $$ ... $$", () => {
    const input = "\\begin{align}a &= b\\end{align}";
    const output = normalizeLatexDelimiters(input);
    expect(output).toMatch(/^\$\$.*\$\$$/s);
    expect(output).toContain("\\begin{align}");
  });

  it("normalizes bare \\begin{align*} ... \\end{align*} into $$ ... $$", () => {
    const input = "\\begin{align*}x &= 1\\end{align*}";
    const output = normalizeLatexDelimiters(input);
    expect(output).toMatch(/^\$\$.*\$\$$/s);
    expect(output).toContain("\\begin{align*}");
  });

  it("leaves content without math untouched", () => {
    const text = "Hello world\n\nNew paragraph.";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });

  it("handles multiple delimited expressions in a single text", () => {
    const input =
      "First \\[a + b\\] then \\(c - d\\) finally \\begin{aligned}x = 1\\end{aligned}";
    const output = normalizeLatexDelimiters(input);
    expect(output).toContain("$$");
    expect(output).not.toContain("\\[");
    expect(output).not.toContain("\\(");
  });
});
