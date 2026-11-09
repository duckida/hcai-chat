"use client";

import { createStore, useStore } from "@/lib/store";

const MODELS_ENDPOINT = "/api/models";
const DEFAULT_CONTEXT_WINDOW = 128000;

// A request that hangs is indistinguishable from one that will never finish,
// and the picker used to sit on "Loading models..." forever in that case. One
// retry covers the transient proxy resets the chat stream already guards
// against; the abort turns a dead connection into a visible error instead.
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

/**
 * A model's display name is either `Provider: Name` (when the catalog
 * includes a colon) or derived from its id slug.
 */
export function splitModelName(model) {
  if (model.name?.includes(":")) {
    const parts = model.name.split(":");
    return [parts[0].trim(), parts.slice(1).join(":").trim()];
  }
  const [providerRaw] = model.id.split("/");
  const provider = providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
  return [provider, model.name || model.id.split("/").pop()];
}

/**
 * Dedupe, group by provider, and sort the catalog, deriving the
 * context-window, tool-support and thinking-capability maps keyed by model id
 * in the same pass.
 */
export function normalizeModelCatalog(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }

  const byProvider = {};
  const contextWindows = {};
  const toolsSupported = {};
  const reasoningByModel = {};

  for (const model of unique) {
    const [provider, name] = splitModelName(model);
    if (!byProvider[provider]) byProvider[provider] = [];
    byProvider[provider].push({ id: model.id, name });
    contextWindows[model.id] = model.context_length || DEFAULT_CONTEXT_WINDOW;
    toolsSupported[model.id] =
      model.supported_parameters?.includes("tools") ?? false;
    // OpenRouter omits `reasoning` on non-reasoning and dynamic-router models,
    // so null is a fact about the model. An id that is *absent* from this map
    // is one the catalog has never heard of — a different case, and the
    // thinking controls treat it differently.
    reasoningByModel[model.id] = model.reasoning ?? null;
  }

  const grouped = {};
  for (const provider of Object.keys(byProvider).sort()) {
    grouped[provider] = byProvider[provider].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  return { grouped, contextWindows, toolsSupported, reasoningByModel };
}

const initialState = {
  grouped: {},
  contextWindows: {},
  toolsSupported: {},
  reasoningByModel: {},
  status: "idle",
};

export const modelsStore = createStore(initialState);

let inflight = null;

async function requestCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(MODELS_ENDPOINT, {
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`models request failed: ${response.status}`);
      // A 4xx will not improve on a retry; a 5xx (or a dead connection) might.
      error.retryable = response.status >= 500;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCatalog() {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestCatalog();
    } catch (error) {
      lastError = error;
      if (error?.retryable === false) break;
    }
  }
  throw lastError;
}

/**
 * Fetch the catalog once per session. Concurrent callers share a single
 * request, and a loaded catalog is not refetched — `resetModels` is the
 * escape hatch tests use for isolation. A failed load leaves `status: "error"`
 * so a later call (the picker's retry row, the settings modal) can try again.
 */
export function loadModels() {
  if (inflight) return inflight;
  if (modelsStore.getState().status === "ready") return Promise.resolve();

  modelsStore.setState({ status: "loading" });
  inflight = (async () => {
    try {
      const data = await fetchCatalog();
      modelsStore.setState({ ...normalizeModelCatalog(data), status: "ready" });
    } catch {
      if (modelsStore.getState().status !== "ready") {
        modelsStore.setState({ status: "error" });
      }
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function resetModels() {
  inflight = null;
  modelsStore.setState({ ...initialState });
}

export function getContextWindow(modelId) {
  return modelsStore.getState().contextWindows[modelId] || 0;
}

export function useModels(selector) {
  return useStore(modelsStore, selector);
}
