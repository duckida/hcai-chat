import { describe, expect, it } from "vitest";
import {
  ARTIFACT_INSTRUCTIONS,
  extractHtmlArtifacts,
} from "../artifacts";

describe("extractHtmlArtifacts", () => {
  it("returns empty result for empty input", () => {
    expect(extractHtmlArtifacts("")).toEqual({
      artifacts: [],
      cleanedText: "",
      streamingArtifact: null,
    });
  });

  it("returns empty result for null/undefined input", () => {
    expect(extractHtmlArtifacts(null)).toEqual({
      artifacts: [],
      cleanedText: "",
      streamingArtifact: null,
    });
    expect(extractHtmlArtifacts(undefined)).toEqual({
      artifacts: [],
      cleanedText: "",
      streamingArtifact: null,
    });
  });

  it("returns text unchanged when there are no html fences", () => {
    const text = "Just a regular response with no artifacts.";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual([]);
    expect(result.cleanedText).toBe(text);
    expect(result.streamingArtifact).toBe(null);
  });

  it("extracts a single complete html artifact", () => {
    const text = 'Here is code:\n\n```html\n<!DOCTYPE html>\n<html></html>\n```\n\nDone.';
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual(["<!DOCTYPE html>\n<html></html>"]);
    expect(result.cleanedText).toBe("Here is code:\n\nDone.");
    expect(result.streamingArtifact).toBe(null);
  });

  it("extracts multiple html artifacts", () => {
    const text = [
      "First:",
      "```html",
      "<div>One</div>",
      "```",
      "",
      "Second:",
      "```html",
      "<div>Two</div>",
      "```",
    ].join("\n");
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual(["<div>One</div>", "<div>Two</div>"]);
    expect(result.cleanedText).toBe("First:\n\nSecond:");
  });

  it("handles case-insensitive html language identifier", () => {
    const text = "```HTML\n<div>Hi</div>\n```";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual(["<div>Hi</div>"]);
  });

  it("captures an unclosed html fence as a streaming artifact", () => {
    const text = 'Intro line.\n\n```html\n<div>partial';
    const result = extractHtmlArtifacts(text);
    expect(result.streamingArtifact).toBe("<div>partial");
    expect(result.cleanedText).toBe("Intro line.");
    expect(result.artifacts).toEqual([]);
  });

  it("trims trailing whitespace from the streaming artifact", () => {
    const text = "```html\n<div>content   \n\n";
    const result = extractHtmlArtifacts(text);
    expect(result.streamingArtifact).toBe("<div>content");
  });

  it("collapses excessive blank lines in cleaned text", () => {
    const text = "Line 1\n\n\n\n\nLine 2";
    const result = extractHtmlArtifacts(text);
    expect(result.cleanedText).toBe("Line 1\n\nLine 2");
  });

  it("does not extract non-html code fences", () => {
    const text = "```js\nconst x = 1;\n```";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual([]);
    expect(result.cleanedText).toBe(text);
  });

  it("preserves content order when multiple complete blocks are present", () => {
    const text = "```html\n<p>A</p>\n```middle```html\n<p>B</p>\n```end";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual(["<p>A</p>", "<p>B</p>"]);
    expect(result.cleanedText).toBe("middleend");
  });
});

describe("ARTIFACT_INSTRUCTIONS", () => {
  it("is a non-empty string", () => {
    expect(typeof ARTIFACT_INSTRUCTIONS).toBe("string");
    expect(ARTIFACT_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it("mentions the html fence format", () => {
    expect(ARTIFACT_INSTRUCTIONS).toContain("```html");
  });
});
