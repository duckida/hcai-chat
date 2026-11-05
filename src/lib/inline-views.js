/**
 * Inline views are small, self-contained HTML visuals the model asks for in a
 * reply as `<inline title="…">description</inline>`. The tag holds a *brief*,
 * not the markup: a second, separately chosen model turns that brief into the
 * HTML, so a long document never enters the conversation's context. Unlike
 * artifacts — which are full pages that open in the side panel — an inline view
 * is rendered in place in the message, so the surrounding prose keeps its
 * order.
 *
 * This module is imported by the chat route as well as by client components,
 * so it must stay free of React and browser globals. The document builder is a
 * pure string transform; the theme values it receives are read by the caller.
 */

/**
 * A complete view, or a fenced/inline code span that must be skipped.
 *
 * The code alternative is what stops a reply that *quotes* the template — "put
 * it in `<inline>` like this" — from being mistaken for a real view. It comes
 * first so a fence that starts before a tag consumes the tag with it, while a
 * view that contains backticks is still consumed whole by the inline branch.
 */
const SEGMENT =
  /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)|<inline\b([^>]*)>([\s\S]*?)<\/inline\s*>/gi;

function parseTitleAttribute(attributes) {
  const match = /title\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
    attributes || "",
  );
  const title = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  return title.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function getInlineViewTitle(html, fallback = "Inline view") {
  const match = String(html || "").match(
    /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i,
  );
  const title = match?.[1]
    ?.replace(/\s+/g, " ")
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return title || fallback;
}

function pushText(parts, raw) {
  if (!raw) return;
  // Trim only the block's own edge newlines. Internal spacing belongs to the
  // markdown around the view.
  const text = raw.replace(/^\n+/, "").replace(/\n+$/, "");
  if (text.trim() === "") return;
  parts.push({ type: "text", text });
}

/**
 * Find an `<inline>` that opened but never closed, ignoring tags quoted inside
 * code. The caller renders the body as "still arriving", so a false positive
 * here would hide ordinary prose.
 */
function findUnclosedOpen(tail) {
  const code = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/gi;
  let cursor = 0;
  let match = code.exec(tail);
  while (match) {
    const before = tail.slice(cursor, match.index);
    const open = /<inline\b([^>]*)>/i.exec(before);
    if (open) {
      return {
        index: cursor + open.index,
        length: open[0].length,
        attributes: open[1],
      };
    }
    cursor = code.lastIndex;
    match = code.exec(tail);
  }
  const before = tail.slice(cursor);
  const open = /<inline\b([^>]*)>/i.exec(before);
  return open
    ? {
        index: cursor + open.index,
        length: open[0].length,
        attributes: open[1],
      }
    : null;
}

/**
 * Split a response into text and inline-view parts, preserving order.
 *
 * An `<inline>` that has opened but not closed is a stream still arriving. Its
 * body is returned as `streamingView` and is deliberately *not* rendered: a
 * half-written brief is not something to show, and a placeholder for it would
 * appear and disappear as the tag streams. Text before the opening tag is
 * still returned, so an answer keeps streaming normally around it.
 *
 * @returns {{ parts: Array<{type: "text", text: string} | {type: "inline", prompt: string, title: string}>, streamingView: {prompt: string, title: string} | null }}
 */
export function extractInlineViews(text) {
  if (!text) return { parts: [], streamingView: null };
  const source = String(text);
  const parts = [];
  let cursor = 0;
  SEGMENT.lastIndex = 0;
  let match = SEGMENT.exec(source);
  while (match) {
    // group 1 is a code span/fence we deliberately pass through as text;
    // groups 2 and 3 are the attributes and body of a real view.
    if (match[2] !== undefined) {
      pushText(parts, source.slice(cursor, match.index));
      const prompt = match[3].trim();
      parts.push({
        type: "inline",
        prompt,
        // An explicit `title` is the label the model chose for the card; the
        // builder's own `<title>` is only a fallback.
        title: parseTitleAttribute(match[2]) || getInlineViewTitle(prompt),
      });
      // Only a consumed view moves the cursor. A code span is skipped by the
      // matcher but stays part of the text, so it has to be included in the
      // next slice.
      cursor = SEGMENT.lastIndex;
    }
    match = SEGMENT.exec(source);
  }

  const rest = source.slice(cursor);
  const open = findUnclosedOpen(rest);
  if (open) {
    pushText(parts, rest.slice(0, open.index));
    const prompt = rest.slice(open.index + open.length).trim();
    return {
      parts,
      streamingView: prompt
        ? {
            prompt,
            title:
              parseTitleAttribute(open.attributes) ||
              getInlineViewTitle(prompt),
          }
        : null,
    };
  }

  pushText(parts, rest);
  return { parts, streamingView: null };
}

const FALLBACK_TOKENS = {
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.145 0 0)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.145 0 0)",
  "--muted": "oklch(0.97 0 0)",
  "--muted-foreground": "oklch(0.42 0 0)",
  "--border": "oklch(0.922 0 0)",
  "--primary": "oklch(0.205 0 0)",
  "--primary-foreground": "oklch(0.985 0 0)",
  "--accent": "oklch(0.97 0 0)",
  "--accent-foreground": "oklch(0.205 0 0)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--ring": "oklch(0.708 0 0)",
  "--radius": "0.625rem",
  "--font-sans": "ui-sans-serif, system-ui, sans-serif",
  "--chart-1": "oklch(0.87 0 0)",
  "--chart-2": "oklch(0.556 0 0)",
  "--chart-3": "oklch(0.439 0 0)",
  "--chart-4": "oklch(0.371 0 0)",
  "--chart-5": "oklch(0.269 0 0)",
};

export const INLINE_VIEW_TOKENS = Object.keys(FALLBACK_TOKENS);

function tokenBlock(tokens = {}) {
  return INLINE_VIEW_TOKENS.map(
    (name) => `  ${name}: ${tokens[name] || FALLBACK_TOKENS[name]};`,
  ).join("\n");
}

function baseStyles(tokens, colorScheme) {
  return `
:root {
${tokenBlock(tokens)}
  color-scheme: ${colorScheme === "dark" ? "dark" : "light"};
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  padding: 16px;
  -webkit-font-smoothing: antialiased;
}
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
a { color: var(--primary); }
canvas, svg { display: block; max-width: 100%; }
.hcai-view { display: flex; flex-direction: column; gap: 12px; }
.hcai-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hcai-card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}
.hcai-muted { color: var(--muted-foreground); }
.hcai-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.hcai-btn {
  background: var(--primary);
  color: var(--primary-foreground);
  border: 0;
  border-radius: calc(var(--radius) * 0.8);
  padding: 6px 12px;
  font-weight: 600;
}
.hcai-btn-secondary { background: var(--muted); color: var(--foreground); }
.hcai-range { width: 100%; accent-color: var(--primary); }
`.trim();
}

// The iframe is sandboxed without same-origin access, so it reports its own
// height instead of letting the parent measure it. rAF coalesces the burst of
// mutations a simulation can produce into one message per frame.
const HEIGHT_SCRIPT = `
<script data-hcai-inline-height>
(function () {
  var last = 0;
  function measure() {
    var height = Math.ceil(
      Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      )
    );
    if (!height || height === last) return;
    last = height;
    parent.postMessage({ type: "hcai-inline-height", height: height }, "*");
  }
  function schedule() { requestAnimationFrame(measure); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }
  window.addEventListener("load", schedule);
  window.addEventListener("resize", schedule);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(schedule).observe(document.documentElement);
  }
  if (typeof MutationObserver !== "undefined" && document.body) {
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }
  setTimeout(schedule, 100);
})();
</script>`.trim();

/**
 * Wrap a view's HTML in the page shell it is rendered in: the app's theme
 * tokens, the app's font faces, a small set of base classes that match the
 * interface, and the height reporter. A model that ignores the "no document
 * wrappers" rule still gets its own `<head>`/`<body>` respected — the shell is
 * injected into them rather than nested inside them.
 *
 * `fontCss`/`fontLinks` come from the parent document: an iframe with an
 * opaque origin cannot reach the parent's `@font-face` rules or load its
 * self-hosted files (no CORS), so the faces are copied in, same-origin files
 * inlined as data URLs by the caller. Without them the view falls back to a
 * generic sans and stops matching the thread.
 */
export function buildInlineViewDocument(
  html,
  { tokens, colorScheme, fontCss, fontLinks } = {},
) {
  const source = String(html || "").trim();
  const fontStyle = fontCss
    ? `<style data-hcai-inline-font>${fontCss}</style>`
    : "";
  const fontLinkTags = (fontLinks || [])
    .map(
      (href) =>
        `<link rel="stylesheet" href="${String(href).replace(/"/g, "&quot;")}">`,
    )
    .join("");
  const style = `${fontStyle}${fontLinkTags}<style data-hcai-inline-base>${baseStyles(tokens, colorScheme)}</style>`;
  const script = HEIGHT_SCRIPT;

  if (/<html[\s>]/i.test(source)) {
    let doc = source;
    if (/<head[\s>]/i.test(doc)) {
      doc = doc.replace(/<head([^>]*)>/i, (head) => `${head}${style}`);
    } else {
      doc = doc.replace(
        /<html([^>]*)>/i,
        (open) => `${open}<head>${style}</head>`,
      );
    }
    if (/<\/body\s*>/i.test(doc)) {
      doc = doc.replace(/<\/body\s*>/i, `${script}</body>`);
    } else {
      doc += script;
    }
    return doc;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${style}
</head>
<body>
${source}
${script}
</body>
</html>`;
}

/**
 * System-level instructions appended when inline views are enabled. They teach
 * the *brief*, not the markup: a separate builder model writes the HTML from
 * it, so the chat model only spends a sentence on the visual and the document
 * never enters this conversation's context.
 */
export const INLINE_VIEW_INSTRUCTIONS = `
## Inline Views

You can have a small visual rendered inline in your reply. You do not write the HTML: a separate builder model turns your description into the view, and the app shows a placeholder until it is ready. Write the description inside an \`<inline title="Short label">\` block:

<inline title="Sine Wave">
A canvas plot of a sine wave over one full period, with a frequency slider from 1 to 10 (default 3). Redraw on resize. Label the slider "Frequency" and show its current value beside it.
</inline>

Rules:
- Most answers should have no view at all. Add one only when it adds significant value to the answer — when a visual or interactive view genuinely explains the content better than prose. Never as decoration, never to fill space, and never for something a sentence or a short list already says clearly. Do not mention inline views, the \`<inline>\` tag, or that you can render visuals unless the user asks about that capability.
- The builder sees only what is inside the tag. State the values, labels, ranges and behavior it needs; it cannot see the conversation.
- Keep the description under about 60 words. Say what the view shows and does, not how to code it.
- Never put HTML, CSS, JavaScript, or a code fence inside the tag. The builder writes all of that.
- Put the opening and closing tags on their own lines, one tag per view, with a title of at most four words.
- Keep the surrounding explanation brief. Do not repeat the view's data in prose.
- Use \`<inline>\` only for visual or interactive content. Code snippets, tables, lists, and ordinary prose belong in normal Markdown.
- When artifacts are also available, use \`<artifact>\` for a complete standalone page or app and \`<inline>\` for a small visual embedded in the answer.
`.trim();

/**
 * System prompt for the builder model that turns an inline-view brief into
 * HTML. It owns the theme contract: the token names and helper classes are the
 * part a model cannot guess, and a view that hard-codes its own colors is the
 * one thing that would make these look foreign in the thread.
 */
export const INLINE_VIEW_GENERATOR_PROMPT = `
You build one small, self-contained HTML visual for an inline card in a chat interface. The user message is a description of what the view should show; return the HTML that renders it.

Output ONLY the HTML fragment — no markdown fences, no <html>, <head> or <body> wrappers, no explanation before or after.

Rules:
- The app supplies the page shell, theme tokens and base styles. Use them; do not ship a document of your own.
- Style with the app's CSS variables instead of hard-coded colors: \`var(--background)\`, \`var(--foreground)\`, \`var(--card)\`, \`var(--card-foreground)\`, \`var(--muted)\`, \`var(--muted-foreground)\`, \`var(--border)\`, \`var(--primary)\`, \`var(--primary-foreground)\`, \`var(--accent)\`, \`var(--destructive)\`, \`var(--radius)\`, and \`var(--chart-1)\` through \`var(--chart-5)\`.
- Helper classes are provided and match the app: \`.hcai-view\` (vertical stack), \`.hcai-row\` (horizontal row), \`.hcai-card\` (bordered surface), \`.hcai-muted\` (secondary text), \`.hcai-value\` (tabular number), \`.hcai-btn\` / \`.hcai-btn-secondary\` (buttons), and \`.hcai-range\` (slider).
- All CSS and JavaScript must be inline; no external scripts, stylesheets, fonts, or network requests.
- Use a responsive \`canvas\` or \`svg\` for plots and simulations, and redraw on resize. Give controls visible labels and accessible names.
- Keep the whole view under about 600px tall, and make it work from 320px to 700px wide.
- Do not add a heading or title that repeats the surrounding chat text; the card has no chrome of its own.
`.trim();

/**
 * Clean up a builder model's reply: strip a markdown fence it was told not to
 * add, and any prose before the first tag. Returns "" when nothing usable came
 * back, so the caller can show a retry instead of an empty card.
 */
export function normalizeGeneratedInlineView(text) {
  let html = String(text || "").trim();
  if (!html) return "";
  const fenced = /^```(?:html)?\s*\n([\s\S]*?)\n?```$/i.exec(html);
  if (fenced) html = fenced[1].trim();
  const firstTag = html.search(/<[a-z!/]/i);
  if (firstTag > 0) html = html.slice(firstTag);
  // Prose before the markup can carry its own fence: the reply opened with a
  // sentence, so the whole-fence regex above did not match.
  const trailingFence = html.lastIndexOf("```");
  if (trailingFence > 0) html = html.slice(0, trailingFence).trimEnd();
  // A reply with no tag at all is prose — a refusal, not a view. The caller
  // shows a retry rather than rendering a sentence in the frame.
  if (!/<[a-z!/]/i.test(html)) return "";
  return html.trim();
}

/**
 * Whether an `<inline>` body is already markup rather than a brief.
 *
 * Older conversations stored the full document in the tag, and a model that
 * ignores the brief instruction can still emit one. Sending that to the
 * builder would ask it to build a view *of* a view, so anything that clearly
 * starts as a document is rendered as-is. A description that merely mentions
 * a tag ("a <canvas> plot…") does not match, because it does not start with
 * one.
 */
export function isInlineViewMarkup(text) {
  const body = String(text || "").trimStart();
  return (
    /^<(?:!doctype|html|div|canvas|svg|style|script|section|main|body|table|figure|p)\b/i.test(
      body,
    ) || /<!doctype html/i.test(body)
  );
}
