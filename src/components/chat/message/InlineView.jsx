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
  adoptInlineView,
  getInlineViewEntry,
  inlineViewKey,
  legacyInlineViewKey,
  requestInlineView,
  retryInlineView,
  subscribeInlineViews,
} from "@/lib/inline-view-cache";
import { parseInlineViewSpec } from "@/lib/inline-view-catalog";
import { readInlineViewFontSources } from "@/lib/inline-view-font";
import {
  buildInlineViewDocument,
  getInlineViewTitle,
  INLINE_VIEW_TOKENS,
  resolveInlineViewFormat,
} from "@/lib/inline-views";
import JsonInlineView from "./JsonInlineView";

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
 *
 * The font faces are collected separately and asynchronously because they
 * need their same-origin files inlined; a view renders with the theme first
 * and reloads once the faces are ready. The document is only rebuilt when the
 * sources actually change, and the collection itself is cached.
 */
function useInlineViewTheme() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      const next = readTheme();
      if (!cancelled) setTheme((current) => ({ ...current, ...next }));
      const fonts = await readInlineViewFontSources();
      if (!cancelled) setTheme((current) => ({ ...current, ...fonts }));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
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
 * Shown while the builder model is working. It is deliberately just a box
 * with a slow gray sweep — no title and no "generating" copy. A skeleton that
 * looked like a chart would read as content that failed to load, and the
 * title belongs to the surrounding prose, not to the card. The global
 * animations toggle stops the sweep like every other animation.
 */
function ViewPlaceholder() {
  return (
    <ViewFrame>
      <output
        aria-busy="true"
        aria-label="Generating inline view"
        className="block h-[260px] w-full animate-hcai-shimmer bg-[linear-gradient(90deg,var(--muted)_0%,var(--border)_50%,var(--muted)_100%)] bg-[length:200%_100%]"
      />
    </ViewFrame>
  );
}

/**
 * A single `<inline>` block rendered in the message.
 *
 * Three bodies arrive here. A `description` is sent to the builder model —
 * chosen in Settings > Models — and the resulting HTML is cached by the brief,
 * so changing that model never rewrites a view already in the history. A
 * `json-render` body is a validated spec rendered with the
 * app's own React components, so it needs no frame. An `html` body is markup
 * and runs in the sandboxed frame, exactly like the artifact preview: it can
 * animate and respond, but it cannot reach this app's storage or DOM.
 */
export default function InlineView({
  prompt,
  title,
  format = "description",
  model,
  providerSlug,
}) {
  const theme = useInlineViewTheme();
  const frameRef = useRef(null);
  const [height, setHeight] = useState(null);

  // The body is authoritative: a stale format attribute must not stop a brief
  // reaching the builder or send an already-built view there as prose.
  const kind = resolveInlineViewFormat(prompt, format);

  // The brief alone identifies the document. The builder model is only used to
  // create one that does not exist yet, so switching models leaves every view
  // already in the history exactly as it was generated.
  const key = useMemo(() => inlineViewKey(prompt), [prompt]);
  // Documents built before the model left the key are still in storage under
  // the old (model, brief) pair. The current model's pair is the only one that
  // can be computed; when it matches, that document is adopted below.
  const legacyKey = useMemo(
    () => legacyInlineViewKey(model, prompt),
    [model, prompt],
  );
  const spec = useMemo(
    () => (kind === "json-render" ? parseInlineViewSpec(prompt) : null),
    [kind, prompt],
  );
  const entry = useSyncExternalStore(
    subscribeInlineViews,
    () => getInlineViewEntry(key, legacyKey),
    () => null,
  );

  useEffect(() => {
    if (kind !== "description" || !prompt) return;
    adoptInlineView(key, legacyKey);
    if (getInlineViewEntry(key)) return;
    requestInlineView({ key, prompt, model, providerSlug });
  }, [key, legacyKey, kind, prompt, model, providerSlug]);

  const html =
    kind === "html"
      ? prompt
      : kind === "description" && entry?.status === "ready"
        ? entry.html
        : null;

  const documentSource = useMemo(
    () =>
      html
        ? buildInlineViewDocument(html, {
            tokens: theme?.tokens,
            colorScheme: theme?.colorScheme,
            fontCss: theme?.fontCss,
            fontLinks: theme?.fontLinks,
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

  if (kind === "json-render") {
    if (!spec) {
      return (
        <ViewFrame>
          <div className="p-4 text-[12px] font-medium text-muted-foreground">
            Couldn&apos;t render this view.
          </div>
        </ViewFrame>
      );
    }
    return (
      <ViewFrame>
        <div className="min-w-0 max-h-[720px] overflow-y-auto bg-card p-4 text-card-foreground sm:p-5">
          <JsonInlineView spec={spec} />
        </div>
      </ViewFrame>
    );
  }

  if (!html && kind === "description" && entry?.status === "error") {
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

  if (!html) return <ViewPlaceholder />;

  return (
    <ViewFrame>
      <iframe
        ref={frameRef}
        title={label}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={documentSource}
        style={{ height: `${height ?? DEFAULT_HEIGHT}px` }}
        className="block w-full border-0 bg-background"
      />
    </ViewFrame>
  );
}
