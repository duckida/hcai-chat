import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let settings;
let useSettings;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.documentElement.classList.remove("theme-sunrise", "theme-hackclub");
  settings = await import("@/stores/settings");
  useSettings = settings.useSettings;
});

describe("settings store", () => {
  it("starts at SSR-safe defaults before hydration", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.selectedModel).toBe("deepseek/deepseek-v4.1-flash");
    expect(result.current.thinkingLevel).toBe("medium");
    expect(result.current.artifactsEnabled).toBe(false);
    expect(result.current.agentModeEnabled).toBe(false);
    expect(result.current.showSandboxCode).toBe(true);
    expect(result.current.maxTokens).toBe(32000);
    expect(result.current.theme).toBe("aurora");
  });

  it("does not read storage during render, only in hydrateSettings", () => {
    localStorage.setItem("selected_model", "qwen/qwen3.6-flash");
    localStorage.setItem("thinking_level", "off");

    const { result } = renderHook(() => useSettings());
    expect(result.current.selectedModel).toBe("deepseek/deepseek-v4.1-flash");
    expect(result.current.thinkingLevel).toBe("medium");

    act(() => settings.hydrateSettings());
    expect(result.current.selectedModel).toBe("qwen/qwen3.6-flash");
    expect(result.current.thinkingLevel).toBe("off");
  });

  it("hydrates every declared key from storage", () => {
    localStorage.setItem("selected_model", "qwen/qwen3.6-flash");
    localStorage.setItem("thinking_level", "off");
    localStorage.setItem("max_tokens", "1024");

    act(() => settings.hydrateSettings());

    const state = settings.settingsStore.getState();
    expect(state.selectedModel).toBe("qwen/qwen3.6-flash");
    expect(state.thinkingLevel).toBe("off");
    expect(state.maxTokens).toBe(1024);
    expect(state.showSandboxCode).toBe(true);
  });

  it("keeps defaults when storage holds malformed values", () => {
    localStorage.setItem("max_tokens", "not-json");
    act(() => settings.hydrateSettings());
    expect(settings.settingsStore.getState().maxTokens).toBe(32000);
  });

  it("writes through setSetting and persists it", () => {
    act(() => settings.setSetting("selectedModel", "qwen/qwen3.6-flash"));
    expect(settings.settingsStore.getState().selectedModel).toBe(
      "qwen/qwen3.6-flash",
    );
    expect(localStorage.getItem("selected_model")).toBe("qwen/qwen3.6-flash");
  });

  it("persists boolean settings as JSON", () => {
    act(() => settings.setSetting("artifactsEnabled", true));
    expect(localStorage.getItem("artifacts_enabled")).toBe("true");
  });

  it("does not re-render when the value is unchanged", () => {
    const { result } = renderHook(() => useSettings());
    const before = result.current;
    act(() => settings.setSetting("selectedModel", result.current.selectedModel));
    expect(result.current).toBe(before);
  });

  it("keeps the same reference when unrelated keys change", () => {
    const { result } = renderHook(() => useSettings((s) => s.maxTokens));
    act(() => settings.setSetting("thinkingLevel", "high"));
    expect(result.current).toBe(32000);
  });
});

describe("settings store theme classes", () => {
  it("toggles theme classes on the document root", () => {
    const root = document.documentElement;

    act(() => settings.setSetting("theme", "sunrise"));
    expect(root.classList.contains("theme-sunrise")).toBe(true);

    act(() => settings.setSetting("theme", "hackclub"));
    expect(root.classList.contains("theme-sunrise")).toBe(false);
    expect(root.classList.contains("theme-hackclub")).toBe(true);

    act(() => settings.setSetting("theme", "aurora"));
    expect(root.classList.contains("theme-hackclub")).toBe(false);
  });

  it("restores the stored theme class during hydration", () => {
    localStorage.setItem("theme", "hackclub");
    act(() => settings.hydrateSettings());
    expect(
      document.documentElement.classList.contains("theme-hackclub"),
    ).toBe(true);
  });

  it("clears theme classes when hydration finds the default", () => {
    document.documentElement.classList.add("theme-sunrise");
    act(() => settings.hydrateSettings());
    expect(
      document.documentElement.classList.contains("theme-sunrise"),
    ).toBe(false);
  });
});

describe("settings store keys", () => {
  it("never writes under a key the old hook did not use", () => {
    act(() => settings.setSetting("showMetrics", false));
    expect(localStorage.getItem("show_metrics")).toBe("false");
    expect(localStorage.length).toBe(1);
  });
});
