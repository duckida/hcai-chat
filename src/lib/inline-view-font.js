"use client";

/**
 * Copy the app's font faces into an inline view's sandboxed document.
 *
 * A view renders in an iframe with `sandbox="allow-scripts"` and no
 * same-origin access, so it cannot see the parent's `@font-face` rules and
 * cannot load the app's self-hosted font files: the request is cross-origin
 * from an opaque origin, and Next serves `/_next/static/media` without CORS.
 * The result was a view that silently fell back to the browser's default
 * serif and read as foreign next to the thread.
 *
 * The fix is to hand the iframe the faces themselves. Same-origin font files
 * are fetched here, where the request is allowed, and inlined as data URLs;
 * cross-origin faces (the CDN-hosted theme fonts) keep their URLs because
 * those servers do send `Access-Control-Allow-Origin`. A custom Google Font
 * is loaded by a stylesheet whose rules are cross-origin and unreadable, so
 * its `<link>` is forwarded instead.
 *
 * Collection is cached by the parent's resolved font stack: the theme only
 * changes when the user changes it, and re-fetching a dozen font files on
 * every view would be worse than the bug.
 */

const dataUrlCache = new Map(); // absolute font URL -> data URL
let cachedKey = null;
let cachedSources = null;
let inflight = null;

function unquote(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function familyNames(stack) {
  return stack.split(",").map(unquote).filter(Boolean);
}

function collectFontFaceRules(families) {
  const wanted = new Set(families);
  const rules = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules;
    // A cross-origin stylesheet (the Google Fonts link) throws on `cssRules`.
    // Its faces are handled by forwarding the link instead.
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(cssRules || [])) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const family = unquote(rule.style.getPropertyValue("font-family"));
      if (wanted.has(family)) rules.push(rule);
    }
  }
  return rules;
}

async function toDataUrl(rawUrl) {
  let absolute;
  try {
    absolute = new URL(rawUrl, window.location.href);
  } catch {
    return rawUrl;
  }
  // A CDN face already sends CORS; a data URL is only needed for our own
  // static files.
  if (absolute.origin !== window.location.origin) return rawUrl;

  const key = absolute.href;
  if (!dataUrlCache.has(key)) {
    dataUrlCache.set(
      key,
      fetch(key)
        .then((response) => {
          if (!response.ok) throw new Error(`font ${response.status}`);
          return response.blob();
        })
        .then(
          (blob) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            }),
        )
        .catch(() => rawUrl),
    );
  }
  return dataUrlCache.get(key);
}

async function inlineSameOriginUrls(cssText) {
  let output = cssText;
  const urls = [...cssText.matchAll(/url\((['"]?)([^'")]+)\1\)/g)];
  for (const match of urls) {
    const replacement = await toDataUrl(match[2]);
    if (replacement !== match[2]) {
      output = output.replace(match[0], `url("${replacement}")`);
    }
  }
  return output;
}

/**
 * @returns {Promise<{ fontCss: string, fontLinks: string[] }>}
 */
export async function readInlineViewFontSources() {
  if (typeof window === "undefined") return { fontCss: "", fontLinks: [] };

  const bodyFont = getComputedStyle(document.body).fontFamily || "";
  const customLink =
    document.getElementById("hcai-custom-google-font")?.href || "";
  const key = `${bodyFont}\u0000${customLink}`;
  if (key === cachedKey && cachedSources) return cachedSources;
  if (key === cachedKey && inflight) return inflight;

  cachedKey = key;
  inflight = (async () => {
    const families = familyNames(bodyFont);
    const rules = collectFontFaceRules(families);
    const css = await Promise.all(
      rules.map((rule) => inlineSameOriginUrls(rule.cssText)),
    );
    cachedSources = {
      fontCss: css.join("\n"),
      fontLinks: customLink ? [customLink] : [],
    };
    return cachedSources;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Tests only: drop the collected faces so one case cannot seed the next. */
export function resetInlineViewFontCache() {
  dataUrlCache.clear();
  cachedKey = null;
  cachedSources = null;
  inflight = null;
}
