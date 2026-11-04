import { describe, expect, it } from "vitest";
import {
  buildInlineViewDocument,
  extractInlineViews,
  getInlineViewTitle,
  INLINE_VIEW_INSTRUCTIONS,
} from "../inline-views";

describe("extractInlineViews", () => {
  it("returns nothing for empty input", () => {
    expect(extractInlineViews("")).toEqual({ parts: [], streamingView: null });
    expect(extractInlineViews(null)).toEqual({ parts: [], streamingView: null });
  });

  it("splits text around a view without moving the view", () => {
    const text =
      'Before\n<inline title="Demo"><div>hi</div></inline>\nAfter';
    expect(extractInlineViews(text)).toEqual({
      parts: [
        { type: "text", text: "Before" },
        { type: "inline", html: "<div>hi</div>", title: "Demo" },
        { type: "text", text: "After" },
      ],
      streamingView: null,
    });
  });

  it("falls back to the document title when no attribute is given", () => {
    const { parts } = extractInlineViews(
      "<inline><title>My Chart</title><div>chart</div></inline>",
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: "inline", title: "My Chart" });
  });

  it("captures an unclosed view as streaming and keeps the text before it", () => {
    const text = 'Intro\n<inline title="Live"><canvas>';
    expect(extractInlineViews(text)).toEqual({
      parts: [{ type: "text", text: "Intro" }],
      streamingView: { html: "<canvas>", title: "Live" },
    });
  });

  it("does not mistake a quoted tag in a code fence or inline code for a view", () => {
    const text = [
      "Use it like this:",
      "",
      "```html",
      '<inline title="x"><div>x</div></inline>',
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
      '<inline title="Demo"><div>hi</div></inline>\nAfter',
    );
    expect(parts[1]).toEqual({ type: "text", text: "After" });
  });
});

describe("getInlineViewTitle", () => {
  it("prefers the title attribute over the document title", () => {
    const { parts } = extractInlineViews(
      '<inline title="Explicit"><title>Ignored</title><div>chart</div></inline>',
    );
    expect(parts[0].title).toBe("Explicit");
  });

  it("has a safe fallback", () => {
    expect(getInlineViewTitle("<div>no title</div>")).toBe("Inline view");
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
});

describe("INLINE_VIEW_INSTRUCTIONS", () => {
  it("gives the model the tag, the template, and the theme tokens", () => {
    expect(INLINE_VIEW_INSTRUCTIONS).toContain("<inline title=");
    expect(INLINE_VIEW_INSTRUCTIONS).toContain("var(--primary)");
    expect(INLINE_VIEW_INSTRUCTIONS).toContain(".hcai-view");
    expect(INLINE_VIEW_INSTRUCTIONS).toContain("Do NOT include");
  });
});
