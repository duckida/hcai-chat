/**
 * Single source of truth for user-persisted settings.
 *
 * Every persisted preference is declared exactly once here: its in-memory
 * key, its localStorage key, its default, and how the stored string is
 * parsed. Anything reading or writing a setting goes through these helpers
 * (page.js hooks, import-export) so the key list can never drift.
 *
 * Hydration rule: defaults are SSR-safe; the stored value is only read
 * inside a mount effect, never during render.
 */

const JSON_PARSE = (value) => JSON.parse(value);

export const SETTINGS = [
  {
    key: "apiKey",
    storageKey: "hack_club_ai_key",
    default: "",
    parse: String,
    secret: true,
  },
  {
    key: "e2bApiKey",
    storageKey: "e2b_api_key",
    default: "",
    parse: String,
    secret: true,
  },
  {
    key: "selectedModel",
    storageKey: "selected_model",
    default: "xiaomi/mimo-v2.5",
    parse: String,
  },
  {
    key: "titleGenerationModel",
    storageKey: "title_generation_model",
    default: "qwen/qwen3-next-80b-a3b-instruct",
    parse: String,
  },
  {
    key: "thinkingEnabled",
    storageKey: "thinking_enabled",
    default: true,
    parse: JSON_PARSE,
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

/**
 * Serialize every persisted setting for export. Secrets are blanked so an
 * exported archive never contains an API key.
 */
export function exportSettings() {
  const out = {};
  for (const setting of SETTINGS) {
    const stored =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(setting.storageKey);
    out[setting.key] = setting.secret ? "" : (stored ?? "");
  }
  return out;
}

/**
 * Apply imported settings, keyed by in-memory name. Only known keys are
 * accepted; values already use the storage serialization (JSON strings
 * where applicable), so they are written verbatim.
 */
export function importSettings(values) {
  if (!values || typeof values !== "object") return false;
  let applied = false;
  for (const setting of SETTINGS) {
    const incoming = values[setting.key];
    if (typeof incoming !== "string" || incoming === "") continue;
    writeSetting(setting.key, incoming);
    applied = true;
  }
  return applied;
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
