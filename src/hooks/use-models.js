"use client";

import { useEffect, useState } from "react";

const MODELS_ENDPOINT = "/api/models";

/**
 * Dedupe, group by provider, and sort the model catalog from /api/models.
 * Also derives the context-window and tool-support maps keyed by model id.
 *
 * The grouping (and the desktop submenu / mobile accordion markup that
 * consumes it) is shared by the header model dropdown and the settings
 * title-generation picker, so the catalog is fetched and normalized once.
 */
export function useModels() {
  const [groupedModels, setGroupedModels] = useState({});
  const [contextWindowMap, setContextWindowMap] = useState({});
  const [toolsSupportedMap, setToolsSupportedMap] = useState({});

  useEffect(() => {
    let cancelled = false;

    const fetchModels = async () => {
      try {
        const response = await fetch(MODELS_ENDPOINT);
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data.data || !Array.isArray(data.data)) return;

        const uniqueModels = Array.from(
          new Map(data.data.map((m) => [m.id, m])).values(),
        );

        const grouped = uniqueModels.reduce((acc, model) => {
          const [provider, name] = splitModelName(model);
          if (!acc[provider]) acc[provider] = [];
          acc[provider].push({ id: model.id, name });
          return acc;
        }, {});

        const sortedGrouped = {};
        for (const provider of Object.keys(grouped).sort()) {
          sortedGrouped[provider] = grouped[provider].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        }
        if (cancelled) return;
        setGroupedModels(sortedGrouped);

        const ctxMap = {};
        const toolsMap = {};
        for (const m of uniqueModels) {
          ctxMap[m.id] = m.context_length || 128000;
          toolsMap[m.id] = m.supported_parameters?.includes("tools") ?? false;
        }
        setContextWindowMap(ctxMap);
        setToolsSupportedMap(toolsMap);
      } catch (_e) {}
    };
    fetchModels();

    return () => {
      cancelled = true;
    };
  }, []);

  return { groupedModels, contextWindowMap, toolsSupportedMap };
}

/**
 * A model's display name is either `Provider: Name` (when the catalog
 * includes a colon) or derived from its id slug.
 */
function splitModelName(model) {
  if (model.name?.includes(":")) {
    const parts = model.name.split(":");
    return [parts[0].trim(), parts.slice(1).join(":").trim()];
  }
  const [providerRaw] = model.id.split("/");
  const provider = providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
  return [provider, model.name || model.id.split("/").pop()];
}
