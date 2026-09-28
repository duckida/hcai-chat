"use client";

import { createStore, useStore } from "@/lib/store";

const MODELS_ENDPOINT = "/api/models";
const DEFAULT_CONTEXT_WINDOW = 128000;

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
 * context-window and tool-support maps keyed by model id in the same pass.
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

  for (const model of unique) {
    const [provider, name] = splitModelName(model);
    if (!byProvider[provider]) byProvider[provider] = [];
    byProvider[provider].push({ id: model.id, name });
    contextWindows[model.id] = model.context_length || DEFAULT_CONTEXT_WINDOW;
    toolsSupported[model.id] =
      model.supported_parameters?.includes("tools") ?? false;
  }

  const grouped = {};
  for (const provider of Object.keys(byProvider).sort()) {
    grouped[provider] = byProvider[provider].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  return { grouped, contextWindows, toolsSupported };
}

const initialState = {
  grouped: {},
  contextWindows: {},
  toolsSupported: {},
  status: "idle",
};

export const modelsStore = createStore(initialState);

let inflight = null;

/**
 * Fetch the catalog once per session. Concurrent callers share a single
 * request, and a loaded catalog is not refetched — `resetModels` is the
 * escape hatch tests use for isolation.
 */
export function loadModels() {
  if (inflight) return inflight;
  if (modelsStore.getState().status === "ready") return Promise.resolve();

  modelsStore.setState({ status: "loading" });
  inflight = (async () => {
    try {
      const response = await fetch(MODELS_ENDPOINT);
      if (!response.ok) {
        throw new Error(`models request failed: ${response.status}`);
      }
      const data = await response.json();
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
