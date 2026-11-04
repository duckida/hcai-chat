"use client";

import { RefreshCw } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/primitives/button";
import {
  getInlineViewEntry,
  inlineViewKey,
  requestInlineView,
  retryInlineView,
  subscribeInlineViews,
} from "@/lib/inline-view-cache";
import {
  buildInlineViewDocument,
  getInlineViewTitle,
  INLINE_VIEW_TOKENS,
  isInlineViewMarkup,
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

/** The card frame both the placeholder and the finished view sit in. */
function ViewFrame({ children }) {
  return (
    <div className="my-1 overflow-hidden rounded-2xl border border-border bg-background">
      {children}
    </div>
  );
}

/**
 * Shown while the builder model is working. The bars are deliberately
 * abstract: a skeleton that looked like a chart would read as content that
 * failed to load. Opacity-only motion, and the global animations toggle stops
 * it like every other animation.
 */
function ViewPlaceholder({ title }) {
  return (
    <ViewFrame>
      <div aria-busy="true" className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
          <span className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
            {title ? `Generating ${title}…` : "Generating view…"}
          </span>
        </div>
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 animate-pulse rounded-full bg-muted" />
          <div className="h-2 w-14 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </ViewFrame>
  );
}

/**
 * A single `<inline>` block rendered in the message.
 *
 * The tag holds a brief, not markup: the chat model never pays for the
 * document, and the builder model — chosen in Settings > Models — turns the
 * brief into HTML. The result is cached by (model, brief) so re-renders and
 * reloads reuse it. The frame is sandboxed with scripts but without
 * same-origin access, exactly like the artifact preview: a generated view can
 * animate and respond, but it cannot reach this app's storage or DOM.
 */
export default function InlineView({ prompt, title, model, providerSlug }) {
  const theme = useInlineViewTheme();
  const frameRef = useRef(null);
  const [height, setHeight] = useState(null);

  const markup = isInlineViewMarkup(prompt);
  const key = useMemo(() => inlineViewKey(model, prompt), [model, prompt]);
  const entry = useSyncExternalStore(
    subscribeInlineViews,
    () => getInlineViewEntry(key),
    () => null,
  );

  useEffect(() => {
    if (markup || !prompt) return;
    if (getInlineViewEntry(key)) return;
    requestInlineView({ key, prompt, model, providerSlug });
  }, [key, markup, prompt, model, providerSlug]);

  const html = markup ? prompt : entry?.status === "ready" ? entry.html : null;

  const documentSource = useMemo(
    () =>
      html
        ? buildInlineViewDocument(html, {
            tokens: theme?.tokens,
            colorScheme: theme?.colorScheme,
          })
        : "",
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

  const label = title || getInlineViewTitle(html || prompt);

  if (!html && entry?.status === "error") {
    return (
      <ViewFrame>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <span className="min-w-0 flex-1 text-[12px] font-medium text-muted-foreground">
            Couldn&apos;t generate this view.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() =>
              retryInlineView({ key, prompt, model, providerSlug })
            }
          >
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      </ViewFrame>
    );
  }

  if (!html) return <ViewPlaceholder title={label} />;

  return (
    <ViewFrame>
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
    </ViewFrame>
  );
}
