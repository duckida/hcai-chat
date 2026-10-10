/**
 * Single source of truth for user-persisted settings.
 *
 * Every persisted preference is declared exactly once here: its in-memory
 * key, its localStorage key, its default, and how the stored string is
 * parsed. Anything reading or writing a setting goes through these helpers
 * (settings consumers) so the key list can never drift.
 *
 * Hydration rule: defaults are SSR-safe; the stored value is only read
 * inside a mount effect, never during render.
 */

import { DEFAULT_THINKING_LEVEL, isThinkingLevel } from "@/lib/thinking";

const JSON_PARSE = (value) => JSON.parse(value);
/**
 * Suggested families for the Google Font field. The field is free text — the
 * list is only a datalist of starting points, not a whitelist.
 */
export const GOOGLE_FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Nunito",
  "Merriweather",
];

/**
 * A Google Font family is typed by hand, so this runs on any string that can
 * reach it: a fresh keystroke, an older build's stored value, or a hand-edited
 * localStorage entry. Family names are letters, digits, spaces and hyphens;
 * dropping everything else keeps the value from breaking out of the
 * `--font-inter` CSS declaration or the stylesheet URL it is interpolated into.
 * Length is capped because the value ends up in a request URL.
 */
export function sanitizeGoogleFont(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 64);
}

const PROVIDER_MAP_PARSE = (value) => {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([modelId, provider]) =>
        typeof modelId === "string" &&
        modelId.length > 0 &&
        typeof provider === "string" &&
        provider.trim().length > 0,
    ),
  );
};

// Favorites are rendered at the top of the picker, in the order they were
// starred, so a stored list has to be deduped and stripped of anything that is
// not a model id — junk here would render an empty row.
const MODEL_ID_LIST_PARSE = (value) => {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of parsed) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

// A stored level can be anything at all — it was written by an older build, or
// hand-edited — and the picker's label and the request's `effort` both assume a
// known one, so an unknown value reads back as the default instead of an empty
// selection.
const THINKING_LEVEL_PARSE = (value) =>
  isThinkingLevel(value) ? value : DEFAULT_THINKING_LEVEL;

export const SETTINGS = [
  {
    key: "apiKey",
    storageKey: "hack_club_ai_key",
    default: "",
    parse: String,
  },
  {
    key: "e2bApiKey",
    storageKey: "e2b_api_key",
    default: "",
    parse: String,
  },
  {
    key: "selectedModel",
    storageKey: "selected_model",
    default: "deepseek/deepseek-v4.1-flash",
    parse: String,
  },
  {
    key: "titleGenerationModel",
    storageKey: "title_generation_model",
    default: "qwen/qwen3-next-80b-a3b-instruct",
    parse: String,
  },
  {
    key: "thinkingLevel",
    storageKey: "thinking_level",
    default: DEFAULT_THINKING_LEVEL,
    parse: THINKING_LEVEL_PARSE,
  },
  {
    key: "artifactsEnabled",
    storageKey: "artifacts_enabled",
    default: false,
    parse: JSON_PARSE,
  },
  {
    key: "webSearchEnabled",
    storageKey: "web_search_enabled",
    default: false,
    parse: JSON_PARSE,
  },
  {
    key: "agentModeEnabled",
    storageKey: "agent_mode_enabled",
    default: false,
    parse: JSON_PARSE,
  },
  {
    key: "showThinking",
    storageKey: "show_thinking",
    default: false,
    parse: JSON_PARSE,
  },
  {
    key: "showSandboxCode",
    storageKey: "show_sandbox_code",
    default: true,
    parse: JSON_PARSE,
  },
  {
    key: "showSandboxOutput",
    storageKey: "show_sandbox_output",
    default: true,
    parse: JSON_PARSE,
  },
  {
    key: "showMetrics",
    storageKey: "show_metrics",
    default: true,
    parse: JSON_PARSE,
  },
  {
    key: "maxTokens",
    storageKey: "max_tokens",
    default: 32000,
    parse: JSON_PARSE,
  },
  {
    key: "theme",
    storageKey: "theme",
    default: "aurora",
    parse: String,
  },
  {
    key: "openRouterProviders",
    storageKey: "openrouter_providers",
    default: {},
    parse: PROVIDER_MAP_PARSE,
  },
  {
    key: "googleFont",
    storageKey: "google_font",
    default: "Inter",
    parse: (value) => sanitizeGoogleFont(value).trim() || "Inter",
  },
  {
    key: "accentColor",
    storageKey: "accent_color",
    default: "#ec3750",
    parse: (value) =>
      typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
        ? value.toLowerCase()
        : "#ec3750",
  },
  {
    key: "favoriteModels",
    storageKey: "favorite_models",
    default: [],
    parse: MODEL_ID_LIST_PARSE,
  },
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

export const SETTING_KEYS = SETTINGS.map((s) => s.key);

export function getDefaultSetting(key) {
  const setting = BY_KEY.get(key);
  return setting ? structuredCloneSafe(setting.default) : undefined;
}

/**
 * Read a stored setting. Returns the default when localStorage is
 * unavailable (SSR), the key is unknown, or the stored value is malformed.
 */
export function readSetting(key) {
  const setting = BY_KEY.get(key);
  if (!setting || typeof window === "undefined") return getDefaultSetting(key);

  const stored = window.localStorage.getItem(setting.storageKey);
  if (stored == null && key === "thinkingLevel") {
    // Keep the old binary preference when upgrading: false maps to Off, while
    // true maps to the new default effort. New writes use thinking_level.
    const legacyThinking = window.localStorage.getItem("thinking_enabled");
    if (legacyThinking != null) {
      try {
        return JSON.parse(legacyThinking) === false
          ? "off"
          : DEFAULT_THINKING_LEVEL;
      } catch {}
    }
  }
  return deserializeSetting(setting, stored);
}

/**
 * Write a setting to localStorage as JSON. Silently no-ops on the server
 * or when storage is unavailable.
 */
export function writeSetting(key, value) {
  const setting = BY_KEY.get(key);
  if (!setting || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      setting.storageKey,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  } catch {}
}

function deserializeSetting(setting, stored) {
  const fallback = getDefaultSetting(setting.key);
  if (stored === null || stored === undefined) return fallback;
  if (setting.parse === String) return stored;
  try {
    return setting.parse(stored);
  } catch {
    return fallback;
  }
}

function structuredCloneSafe(value) {
  if (typeof value === "object" && value !== null) {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}
