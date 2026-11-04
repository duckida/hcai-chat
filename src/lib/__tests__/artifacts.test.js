import { describe, expect, it } from "vitest";
import {
  ARTIFACT_INSTRUCTIONS,
  extractHtmlArtifacts,
  getArtifactTitle,
  renameArtifact,
  updateArtifactAt,
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

  it("returns text unchanged when there are no artifacts", () => {
    const text = "Just a regular response with no artifacts.";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual([]);
    expect(result.cleanedText).toBe(text);
    expect(result.streamingArtifact).toBe(null);
  });

  it("extracts a single complete artifact", () => {
    const text =
      "Here is code:\n\n<artifact>\n<!DOCTYPE html>\n<html></html>\n</artifact>\n\nDone.";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual(["<!DOCTYPE html>\n<html></html>"]);
    expect(result.cleanedText).toBe("Here is code:\n\nDone.");
    expect(result.streamingArtifact).toBe(null);
  });

  it("extracts multiple artifacts", () => {
    const text = [
      "First:",
      "<artifact>",
      "<div>One</div>",
      "</artifact>",
      "",
      "Second:",
      "<artifact>",
      "<div>Two</div>",
      "</artifact>",
    ].join("\n");
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual(["<div>One</div>", "<div>Two</div>"]);
    expect(result.cleanedText).toBe("First:\n\nSecond:");
  });

  it("handles a case-insensitive artifact tag", () => {
    const text = "<ARTIFACT><div>Hi</div></ARTIFACT>";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual(["<div>Hi</div>"]);
  });

  it("captures an unclosed artifact tag as a streaming artifact", () => {
    const text = "Intro line.\n\n<artifact>\n<div>partial";
    const result = extractHtmlArtifacts(text);
    expect(result.streamingArtifact).toBe("<div>partial");
    expect(result.cleanedText).toBe("Intro line.");
    expect(result.artifacts).toEqual([]);
  });

  it("trims trailing whitespace from the streaming artifact", () => {
    const text = "<artifact>\n<div>content   \n\n";
    const result = extractHtmlArtifacts(text);
    expect(result.streamingArtifact).toBe("<div>content");
  });

  it("collapses excessive blank lines in cleaned text", () => {
    const text = "Line 1\n\n\n\n\nLine 2";
    const result = extractHtmlArtifacts(text);
    expect(result.cleanedText).toBe("Line 1\n\nLine 2");
  });

  // The negative control for the rule this module now enforces: a fence is
  // code the user asked to see. If a complete or partial fence ever starts
  // opening the side panel again, this fails.
  it("never treats an html code fence as an artifact", () => {
    const complete = "Here is code:\n\n```html\n<div>Hi</div>\n```\n\nDone.";
    expect(extractHtmlArtifacts(complete)).toEqual({
      artifacts: [],
      cleanedText: complete,
      streamingArtifact: null,
    });

    const streaming = "Intro line.\n\n```html\n<div>partial";
    expect(extractHtmlArtifacts(streaming)).toEqual({
      artifacts: [],
      cleanedText: streaming,
      streamingArtifact: null,
    });
  });

  it("does not extract non-html code fences", () => {
    const text = "```js\nconst x = 1;\n```";
    const result = extractHtmlArtifacts(text);
    expect(result.artifacts).toEqual([]);
    expect(result.cleanedText).toBe(text);
  });

  it("preserves content order when multiple complete blocks are present", () => {
    const text =
      "<artifact><p>A</p></artifact>middle<artifact><p>B</p></artifact>end";
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

  it("mentions the artifact tag format and title requirement", () => {
    expect(ARTIFACT_INSTRUCTIONS).toContain("<artifact>");
    expect(ARTIFACT_INSTRUCTIONS).toContain("</artifact>");
    expect(ARTIFACT_INSTRUCTIONS).toContain("<title>");
    expect(ARTIFACT_INSTRUCTIONS).toContain("no more than three words");
  });
});

describe("artifact management", () => {
  it("uses and updates the HTML title", () => {
    const renamed = renameArtifact(
      "<html><head><title>Old</title></head><body></body></html>",
      "New & Improved",
    );
    expect(getArtifactTitle(renamed)).toBe("New & Improved");
  });

  it("adds a title when the document does not have one", () => {
    expect(getArtifactTitle(renameArtifact("<html><body></body></html>", "Card"))).toBe(
      "Card",
    );
  });

  it("renames or deletes only the selected artifact block", () => {
    const source =
      "Before <artifact><html><head><title>A</title></head></html></artifact> middle <artifact><html><head><title>B</title></head></html></artifact> after";
    const renamed = updateArtifactAt(source, 1, (html) =>
      renameArtifact(html, "Renamed"),
    );
    expect(extractHtmlArtifacts(renamed).artifacts.map(getArtifactTitle)).toEqual([
      "A",
      "Renamed",
    ]);
    const deleted = updateArtifactAt(renamed, 0, () => null);
    expect(extractHtmlArtifacts(deleted).artifacts.map(getArtifactTitle)).toEqual([
      "Renamed",
    ]);
  });
});
