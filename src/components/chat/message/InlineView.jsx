"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildInlineViewDocument,
  getInlineViewTitle,
  INLINE_VIEW_TOKENS,
} from "@/lib/inline-views";

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 720;
const DEFAULT_HEIGHT = 260;

function readTheme() {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const tokens = {};
  for (const name of INLINE_VIEW_TOKENS) {
    tokens[name] = computed.getPropertyValue(name).trim();
  }
  // `--font-sans` is declared as `var(--font-inter)` in the theme, so reading
  // the variable can hand back an unresolved reference. The computed body font
  // is the resolved stack the interface is actually using.
  const bodyFont = getComputedStyle(document.body).fontFamily;
  if (bodyFont) tokens["--font-sans"] = bodyFont;
  return {
    tokens,
    colorScheme: root.classList.contains("dark") ? "dark" : "light",
  };
}

/**
 * Theme values live on `<html>`, outside the iframe's document. Copying them
 * into the generated document is what makes a view inherit the active palette
 * (including a custom accent) instead of shipping its own colors. A
 * MutationObserver keeps an open view in step when the user changes theme or
 * dark mode.
 */
function useInlineViewTheme() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    const update = () => setTheme(readTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * A single `<inline>` block rendered in the message. The frame is sandboxed
 * with scripts but without same-origin access, exactly like the artifact
 * preview: a generated view can animate and respond, but it cannot reach this
 * app's storage or DOM.
 */
export default function InlineView({ html, title }) {
  const theme = useInlineViewTheme();
  const frameRef = useRef(null);
  const [height, setHeight] = useState(null);

  const documentSource = useMemo(
    () =>
      buildInlineViewDocument(html, {
        tokens: theme?.tokens,
        colorScheme: theme?.colorScheme,
      }),
    [html, theme],
  );

  // A new document starts at the default height again; the old measurement
  // belonged to different content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: documentSource is the reset trigger
  useEffect(() => {
    setHeight(null);
  }, [documentSource]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== "hcai-inline-height") return;
      const next = Number(event.data.height);
      if (!Number.isFinite(next)) return;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(next))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const label = title || getInlineViewTitle(html);

  return (
    <div className="my-1 overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-sm" />
        <span className="min-w-0 truncate font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground/70">
          Inline view
        </span>
      </div>
      <iframe
        ref={frameRef}
        title={label}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        srcDoc={documentSource}
        style={{ height: `${height ?? DEFAULT_HEIGHT}px` }}
        className="block w-full border-0 bg-background"
      />
    </div>
  );
}
