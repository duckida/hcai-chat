import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  exportSettings,
  getDefaultSetting,
  importSettings,
  readSetting,
  SETTING_KEYS,
  writeSetting,
} from "../settings";

const DEFAULT_MODEL = "xiaomi/mimo-v2.5";
const DEFAULT_TITLE_MODEL = "qwen/qwen3-next-80b-a3b-instruct";

describe("settings registry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("declares every persisted key once", () => {
    expect(SETTING_KEYS).toEqual([
      "apiKey",
      "e2bApiKey",
      "selectedModel",
      "titleGenerationModel",
      "thinkingEnabled",
      "artifactsEnabled",
      "webSearchEnabled",
      "agentModeEnabled",
      "showThinking",
      "showSandboxCode",
      "showSandboxOutput",
      "showMetrics",
      "maxTokens",
      "theme",
    ]);
  });

  it("exposes SSR-safe defaults", () => {
    expect(getDefaultSetting("selectedModel")).toBe(DEFAULT_MODEL);
    expect(getDefaultSetting("titleGenerationModel")).toBe(DEFAULT_TITLE_MODEL);
    expect(getDefaultSetting("thinkingEnabled")).toBe(true);
    expect(getDefaultSetting("artifactsEnabled")).toBe(false);
    expect(getDefaultSetting("webSearchEnabled")).toBe(false);
    expect(getDefaultSetting("agentModeEnabled")).toBe(false);
    expect(getDefaultSetting("showThinking")).toBe(false);
    expect(getDefaultSetting("showSandboxCode")).toBe(true);
    expect(getDefaultSetting("showSandboxOutput")).toBe(true);
    expect(getDefaultSetting("showMetrics")).toBe(true);
    expect(getDefaultSetting("maxTokens")).toBe(32000);
    expect(getDefaultSetting("theme")).toBe("aurora");
    expect(getDefaultSetting("apiKey")).toBe("");
    expect(getDefaultSetting("e2bApiKey")).toBe("");
  });

  it("returns defaults when nothing is stored", () => {
    expect(readSetting("selectedModel")).toBe(DEFAULT_MODEL);
    expect(readSetting("maxTokens")).toBe(32000);
  });

  it("round-trips a string setting through its storage key", () => {
    writeSetting("selectedModel", "qwen/qwen3.6-flash");
    expect(localStorage.getItem("selected_model")).toBe("qwen/qwen3.6-flash");
    expect(readSetting("selectedModel")).toBe("qwen/qwen3.6-flash");
  });

  it("round-trips a JSON setting through its storage key", () => {
    writeSetting("maxTokens", 1024);
    expect(localStorage.getItem("max_tokens")).toBe("1024");
    expect(readSetting("maxTokens")).toBe(1024);
  });

  it("round-trips a boolean setting", () => {
    writeSetting("thinkingEnabled", false);
    expect(localStorage.getItem("thinking_enabled")).toBe("false");
    expect(readSetting("thinkingEnabled")).toBe(false);
  });

  it("maps in-memory names to legacy storage keys", () => {
    writeSetting("titleGenerationModel", DEFAULT_TITLE_MODEL);
    expect(localStorage.getItem("title_generation_model")).toBe(
      DEFAULT_TITLE_MODEL,
    );

    writeSetting("agentModeEnabled", true);
    expect(localStorage.getItem("agent_mode_enabled")).toBe("true");

    writeSetting("showSandboxCode", false);
    expect(localStorage.getItem("show_sandbox_code")).toBe("false");
  });

  it("falls back to the default for malformed JSON", () => {
    localStorage.setItem("max_tokens", "not-json");
    expect(readSetting("maxTokens")).toBe(32000);
  });

  it("returns the default for an unknown key", () => {
    expect(readSetting("nope")).toBeUndefined();
  });

  it("treats missing stored values as defaults", () => {
    localStorage.removeItem("thinking_enabled");
    expect(readSetting("thinkingEnabled")).toBe(true);
  });

  it("blanks secrets on export", () => {
    writeSetting("apiKey", "sk-hc-v1-secret");
    writeSetting("e2bApiKey", "e2b-secret");
    writeSetting("selectedModel", "qwen/qwen3.6-flash");

    const exported = exportSettings();
    expect(exported.apiKey).toBe("");
    expect(exported.e2bApiKey).toBe("");
    expect(exported.selectedModel).toBe("qwen/qwen3.6-flash");
  });

  it("exports an entry for every declared key", () => {
    const exported = exportSettings();
    for (const key of SETTING_KEYS) {
      expect(exported).toHaveProperty(key);
    }
  });

  it("imports known keys and ignores unknown ones", () => {
    const applied = importSettings({
      selectedModel: "qwen/qwen3.6-flash",
      maxTokens: "2048",
      theme: "hackclub",
      unknownKey: "ignored",
    });
    expect(applied).toBe(true);
    expect(localStorage.getItem("selected_model")).toBe("qwen/qwen3.6-flash");
    expect(localStorage.getItem("max_tokens")).toBe("2048");
    expect(localStorage.getItem("theme")).toBe("hackclub");
    expect(localStorage.getItem("unknownKey")).toBeNull();
  });

  it("skips empty values when importing", () => {
    const applied = importSettings({ selectedModel: "", theme: "" });
    expect(applied).toBe(false);
  });

  it("ignores non-object input", () => {
    expect(importSettings(null)).toBe(false);
    expect(importSettings("nope")).toBe(false);
  });
});
