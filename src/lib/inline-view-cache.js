"use client";

import { generateInlineView } from "@/lib/api-client";

/**
 * Generated inline views, keyed by builder model + brief.
 *
 * The key is the pair, not the message: the same brief under the same model
 * always yields the same view, so a reload, a re-render, or a second copy in
 * another conversation reuses the document instead of paying for it again.
 * Entries live in memory for the session and in localStorage across reloads,
 * and the cache is bounded so it cannot grow without limit.
 *
 * The store is deliberately tiny and synchronous: `InlineView` reads it through
 * `useSyncExternalStore`, and the request itself is fire-and-forget. That keeps
 * generation out of the conversation's messages, which is the whole point — the
 * HTML never enters the chat context.
 */
const STORAGE_KEY = "hcai_inline_view_cache";
const MAX_ENTRIES = 40;
const MAX_TOTAL_CHARS = 2_000_000;

const entries = new Map(); // key -> { status: "loading" | "ready" | "error", html? }
const listeners = new Set();
let hydrated = false;

/** FNV-1a, run twice with different seeds so a 64-bit key is unlikely to collide. */
function hash(text, seed) {
  let value = seed;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function inlineViewKey(model, prompt) {
  const source = `${model || ""}\u0000${prompt || ""}`;
  return `${hash(source, 0x811c9dc5)}${hash(source, 0x9e3779b9)}`;
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    for (const [key, html] of Object.entries(parsed)) {
      if (typeof html === "string" && html.trim()) {
        entries.set(key, { status: "ready", html });
      }
    }
  } catch {
    // A corrupt cache is not worth a crash; the views regenerate on demand.
  }
}

function persist() {
  if (typeof localStorage === "undefined") return;
  const ready = [...entries].filter(([, entry]) => entry.status === "ready");
  // Map preserves insertion order, so walking backwards keeps the newest
  // entries and drops the oldest first.
  const kept = [];
  let total = 0;
  for (let i = ready.length - 1; i >= 0 && kept.length < MAX_ENTRIES; i--) {
    const [key, entry] = ready[i];
    if (total + entry.html.length > MAX_TOTAL_CHARS) continue;
    kept.push([key, entry.html]);
    total += entry.html.length;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(kept.reverse())),
    );
  } catch {
    // Quota exceeded: the in-memory copy still serves this session.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeInlineViews(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInlineViewEntry(key) {
  hydrate();
  return entries.get(key) || null;
}

/** Ask for a view's document if it is not cached and not already in flight. */
export function requestInlineView({ key, prompt, model, providerSlug = null }) {
  hydrate();
  const existing = entries.get(key);
  if (existing && existing.status !== "error") return;

  entries.set(key, { status: "loading" });
  notify();

  generateInlineView(prompt, model, providerSlug)
    .then((html) => {
      if (html) {
        // Re-insert so this entry counts as the newest for eviction.
        entries.delete(key);
        entries.set(key, { status: "ready", html });
        persist();
      } else {
        entries.set(key, { status: "error" });
      }
    })
    .catch(() => {
      entries.set(key, { status: "error" });
    })
    .finally(notify);
}

export function retryInlineView(options) {
  entries.delete(options.key);
  requestInlineView(options);
}

/** Tests only: drop memory and storage so one case cannot seed the next. */
export function resetInlineViewCache() {
  entries.clear();
  listeners.clear();
  hydrated = false;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}
