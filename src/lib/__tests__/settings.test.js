import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDefaultSetting,
  readSetting,
  SETTING_KEYS,
  writeSetting,
} from "../settings";

const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";
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
      "thinkingLevel",
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
    expect(getDefaultSetting("thinkingLevel")).toBe("medium");
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

  it("round-trips the thinking level through its storage key", () => {
    writeSetting("thinkingLevel", "high");
    expect(localStorage.getItem("thinking_level")).toBe("high");
    expect(readSetting("thinkingLevel")).toBe("high");
  });

  it("reads an unknown stored level back as the default", () => {
    // `effort` values are model-dependent and the picker's label assumes a
    // known level, so junk in storage must not become a selected-but-labelled
    // neither value.
    localStorage.setItem("thinking_level", "galaxy-brain");
    expect(readSetting("thinkingLevel")).toBe("medium");
  });

  it("migrates the old thinking toggle into a level", () => {
    localStorage.setItem("thinking_enabled", "false");
    expect(readSetting("thinkingLevel")).toBe("off");

    localStorage.setItem("thinking_enabled", "true");
    expect(readSetting("thinkingLevel")).toBe("medium");
  });

  it("prefers the new thinking level over the legacy toggle", () => {
    localStorage.setItem("thinking_enabled", "false");
    localStorage.setItem("thinking_level", "high");
    expect(readSetting("thinkingLevel")).toBe("high");
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
    localStorage.removeItem("thinking_level");
    expect(readSetting("thinkingLevel")).toBe("medium");
  });

});
