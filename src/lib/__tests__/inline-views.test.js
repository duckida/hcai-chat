import { describe, expect, it } from "vitest";
import {
  buildInlineViewDocument,
  extractInlineViews,
  getInlineViewTitle,
  INLINE_VIEW_GENERATOR_PROMPT,
  INLINE_VIEW_INSTRUCTIONS,
  isInlineViewMarkup,
  normalizeGeneratedInlineView,
} from "../inline-views";

describe("extractInlineViews", () => {
  it("returns nothing for empty input", () => {
    expect(extractInlineViews("")).toEqual({ parts: [], streamingView: null });
    expect(extractInlineViews(null)).toEqual({ parts: [], streamingView: null });
  });

  it("splits text around a view without moving the view", () => {
    const text =
      'Before\n<inline title="Demo">A chart of monthly rainfall</inline>\nAfter';
    expect(extractInlineViews(text)).toEqual({
      parts: [
        { type: "text", text: "Before" },
        { type: "inline", prompt: "A chart of monthly rainfall", title: "Demo" },
        { type: "text", text: "After" },
      ],
      streamingView: null,
    });
  });

  it("captures an unclosed view as streaming and keeps the text before it", () => {
    const text = 'Intro\n<inline title="Live">A sine wave with a slider';
    expect(extractInlineViews(text)).toEqual({
      parts: [{ type: "text", text: "Intro" }],
      streamingView: { prompt: "A sine wave with a slider", title: "Live" },
    });
  });

  it("does not mistake a quoted tag in a code fence or inline code for a view", () => {
    const text = [
      "Use it like this:",
      "",
      "```html",
      '<inline title="x">A chart</inline>',
      "```",
      "",
      "And `<inline>` is the tag.",
    ].join("\n");

    const { parts, streamingView } = extractInlineViews(text);
    expect(streamingView).toBe(null);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toBe(text);
  });

  it("keeps text after the view", () => {
    const { parts } = extractInlineViews(
      '<inline title="Demo">A chart</inline>\nAfter',
    );
    expect(parts[1]).toEqual({ type: "text", text: "After" });
  });

  it("uses the title attribute over anything inside the tag", () => {
    const { parts } = extractInlineViews(
      '<inline title="Explicit"><title>Ignored</title>brief</inline>',
    );
    expect(parts[0].title).toBe("Explicit");
  });
});

describe("getInlineViewTitle", () => {
  it("reads a document title out of generated markup", () => {
    expect(
      getInlineViewTitle("<html><head><title>My Chart</title></head></html>"),
    ).toBe("My Chart");
  });

  it("has a safe fallback", () => {
    expect(getInlineViewTitle("<div>no title</div>")).toBe("Inline view");
    expect(getInlineViewTitle("")).toBe("Inline view");
  });
});

describe("isInlineViewMarkup", () => {
  it("recognizes markup that predates the brief format", () => {
    expect(isInlineViewMarkup("<div>chart</div>")).toBe(true);
    expect(isInlineViewMarkup("  \n<canvas id='p'></canvas>")).toBe(true);
    expect(isInlineViewMarkup("<!DOCTYPE html><html></html>")).toBe(true);
  });

  it("does not mistake a brief that mentions a tag for markup", () => {
    expect(isInlineViewMarkup("A <canvas> plot of the data")).toBe(false);
    expect(isInlineViewMarkup("A chart of monthly rainfall")).toBe(false);
    expect(isInlineViewMarkup("`<div>` demo of the layout")).toBe(false);
  });
});

describe("normalizeGeneratedInlineView", () => {
  it("passes clean HTML through", () => {
    expect(normalizeGeneratedInlineView("<div>hi</div>")).toBe("<div>hi</div>");
  });

  it("strips a markdown fence the builder was told not to add", () => {
    expect(normalizeGeneratedInlineView("```html\n<div>hi</div>\n```")).toBe(
      "<div>hi</div>",
    );
  });

  it("drops prose the builder wrote before the markup", () => {
    expect(normalizeGeneratedInlineView("Here is the chart:\n\n<div>hi</div>")).toBe(
      "<div>hi</div>",
    );
    // Prose plus its own fence around the markup.
    expect(
      normalizeGeneratedInlineView(
        "Here it is:\n\n```html\n<div id='v'>chart</div>\n```",
      ),
    ).toBe("<div id='v'>chart</div>");
  });

  it("returns empty for nothing usable", () => {
    expect(normalizeGeneratedInlineView("")).toBe("");
    expect(normalizeGeneratedInlineView(null)).toBe("");
    // Prose with no tag is a refusal, not a view.
    expect(normalizeGeneratedInlineView("I cannot do that.")).toBe("");
  });
});

describe("buildInlineViewDocument", () => {
  it("wraps a fragment with the theme tokens and helper classes", () => {
    const doc = buildInlineViewDocument('<div class="hcai-view">hi</div>', {
      tokens: { "--primary": "#ff0000" },
      colorScheme: "dark",
    });

    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("--primary: #ff0000;");
    expect(doc).toContain("color-scheme: dark;");
    expect(doc).toContain(".hcai-view");
    expect(doc).toContain('<div class="hcai-view">hi</div>');
    expect(doc).toContain("hcai-inline-height");
  });

  it("injects the shell into a full document instead of nesting one", () => {
    const source =
      "<!DOCTYPE html><html><head><title>T</title></head><body><p>x</p></body></html>";
    const doc = buildInlineViewDocument(source, {});

    expect(doc.match(/<html[\s>]/gi)).toHaveLength(1);
    expect(doc.indexOf("data-hcai-inline-base")).toBeLessThan(
      doc.indexOf("</head>"),
    );
    expect(doc.indexOf("hcai-inline-height")).toBeLessThan(
      doc.indexOf("</body>"),
    );
    expect(doc).toContain("<p>x</p>");
  });

  it("carries the app's font faces and custom font link into the shell", () => {
    const doc = buildInlineViewDocument("<div>hi</div>", {
      fontCss: '@font-face { font-family: Inter; src: url("data:font/woff2;base64,AA"); }',
      fontLinks: ["https://fonts.googleapis.com/css2?family=Space+Grotesk"],
    });

    expect(doc).toContain("data-hcai-inline-font");
    expect(doc).toContain('font-family: Inter');
    expect(doc).toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk">',
    );
  });
});

describe("INLINE_VIEW_INSTRUCTIONS", () => {
  it("teaches the brief, not the markup", () => {
    expect(INLINE_VIEW_INSTRUCTIONS).toContain("<inline title=");
    // The chat model must not write the document itself — that is the builder's
    // job, and the whole point of the format.
    expect(INLINE_VIEW_INSTRUCTIONS).toContain(
      "Never put HTML, CSS, JavaScript, or a code fence inside the tag",
    );
    expect(INLINE_VIEW_INSTRUCTIONS).not.toContain("hcai-row");
    expect(INLINE_VIEW_INSTRUCTIONS).not.toContain("var(--primary)");
  });

  it("tells the model not to add views or mention them unless relevant", () => {
    expect(INLINE_VIEW_INSTRUCTIONS).toContain(
      "Most answers should have no view",
    );
    expect(INLINE_VIEW_INSTRUCTIONS).toContain("adds significant value");
    expect(INLINE_VIEW_INSTRUCTIONS).toContain("Never as decoration");
    expect(INLINE_VIEW_INSTRUCTIONS).toContain(
      "unless the user asks about that capability",
    );
  });
});

describe("INLINE_VIEW_GENERATOR_PROMPT", () => {
  it("owns the theme contract the chat prompt no longer carries", () => {
    expect(INLINE_VIEW_GENERATOR_PROMPT).toContain("var(--primary)");
    expect(INLINE_VIEW_GENERATOR_PROMPT).toContain(".hcai-view");
    expect(INLINE_VIEW_GENERATOR_PROMPT).toContain("Output ONLY the HTML");
    expect(INLINE_VIEW_GENERATOR_PROMPT).toContain("no external scripts");
  });
});
