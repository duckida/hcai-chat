/**
 * Inline views are small, self-contained HTML visuals the model embeds in a
 * reply as `<inline title="…">…</inline>`. Unlike artifacts — which are full
 * pages that open in the side panel — an inline view is rendered in place in
 * the message, so the surrounding prose keeps its order.
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
 * half-written document would flash a broken canvas before the script that
 * drives it exists. Text before the opening tag is still returned, so an
 * answer keeps streaming normally while the view is built.
 *
 * @returns {{ parts: Array<{type: "text", text: string} | {type: "inline", html: string, title: string}>, streamingView: {html: string, title: string} | null }}
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
      const html = match[3].trim();
      parts.push({
        type: "inline",
        html,
        // An explicit `title` is the label the model chose for the card; the
        // document's own `<title>` is only a fallback.
        title: parseTitleAttribute(match[2]) || getInlineViewTitle(html),
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
    const html = rest.slice(open.index + open.length).trim();
    return {
      parts,
      streamingView: html
        ? {
            html,
            title:
              parseTitleAttribute(open.attributes) || getInlineViewTitle(html),
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
 * tokens, a small set of base classes that match the interface, and the
 * height reporter. A model that ignores the "no document wrappers" rule still
 * gets its own `<head>`/`<body>` respected — the shell is injected into them
 * rather than nested inside them.
 */
export function buildInlineViewDocument(html, { tokens, colorScheme } = {}) {
  const source = String(html || "").trim();
  const style = `<style data-hcai-inline-base>${baseStyles(tokens, colorScheme)}</style>`;
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
 * System-level instructions appended when inline views are enabled. The
 * template is deliberately concrete: the theme variables and helper classes
 * are the part a model cannot guess, and a view that hard-codes its own colors
 * is the one thing that would make these look foreign in the thread.
 */
export const INLINE_VIEW_INSTRUCTIONS = `
## Inline Views

You can render small, self-contained HTML visuals directly inside your reply. Wrap each one in an \`<inline title="Short label">\` block. Use them for content that is easier to understand visually or interactively: charts, plots, diagrams, sliders, small simulations, calculators, or animated illustrations.

Template:

<inline title="Sine Wave">
  <style>
    .plot { width: 100%; height: 180px; background: var(--muted); border-radius: var(--radius); }
    .controls { display: flex; align-items: center; gap: 12px; }
    .controls input { flex: 1; }
  </style>
  <div class="hcai-view">
    <canvas id="plot" class="plot"></canvas>
    <div class="hcai-row controls">
      <label for="freq" class="hcai-muted">Frequency</label>
      <input id="freq" class="hcai-range" type="range" min="1" max="10" value="3">
      <span id="value" class="hcai-value">3</span>
    </div>
  </div>
  <script>
    const canvas = document.getElementById("plot");
    const ctx = canvas.getContext("2d");
    const input = document.getElementById("freq");
    const value = document.getElementById("value");
    function draw() {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary");
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= rect.width; x++) {
        const y = rect.height / 2 + Math.sin((x / rect.width) * Math.PI * 2 * input.value) * rect.height * 0.35;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      value.textContent = input.value;
    }
    input.addEventListener("input", draw);
    window.addEventListener("resize", draw);
    draw();
  </script>
</inline>

Rules:
- Put the opening and closing tags on their own lines, and keep each view under about 600px tall. The app sizes the card to the content and caps it, then scrolls inside.
- The app supplies the page shell, theme tokens, and base styles. Do NOT include \`<html>\`, \`<head>\`, or \`<body>\`. All CSS and JavaScript must be inline; do not use external scripts, stylesheets, fonts, or network requests.
- Style with the app's CSS variables instead of hard-coded colors: \`var(--background)\`, \`var(--foreground)\`, \`var(--card)\`, \`var(--card-foreground)\`, \`var(--muted)\`, \`var(--muted-foreground)\`, \`var(--border)\`, \`var(--primary)\`, \`var(--primary-foreground)\`, \`var(--accent)\`, \`var(--destructive)\`, \`var(--radius)\`, and \`var(--chart-1)\` through \`var(--chart-5)\`.
- Helper classes are provided and match the app: \`.hcai-view\` (vertical stack), \`.hcai-row\` (horizontal row), \`.hcai-card\` (bordered surface), \`.hcai-muted\` (secondary text), \`.hcai-value\` (tabular number), \`.hcai-btn\` / \`.hcai-btn-secondary\` (buttons), and \`.hcai-range\` (slider).
- Use a responsive \`canvas\` or \`svg\` for plots and simulations, and redraw on resize. Give controls visible labels and accessible names.
- Give the view a short \`title\` of at most four words; the app shows it as the card's label.
- Keep the surrounding explanation brief. Do not repeat the view's data in prose.
- Use \`<inline>\` only for visual or interactive content. Code snippets, tables, lists, and ordinary prose belong in normal Markdown.
- When artifacts are also available, use \`<artifact>\` for a complete standalone page or app and \`<inline>\` for a small visual embedded in the answer.
`.trim();
