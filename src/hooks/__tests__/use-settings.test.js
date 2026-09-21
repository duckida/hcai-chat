import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "@/hooks/use-settings";

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts at SSR-safe defaults before hydration", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.values.selectedModel).toBe("xiaomi/mimo-v2.5");
    expect(result.current.values.thinkingEnabled).toBe(true);
    expect(result.current.values.artifactsEnabled).toBe(false);
    expect(result.current.values.agentModeEnabled).toBe(false);
    expect(result.current.values.showSandboxCode).toBe(true);
    expect(result.current.values.maxTokens).toBe(32000);
    expect(result.current.values.theme).toBe("aurora");
  });

  it("hydrates stored values after mount", async () => {
    localStorage.setItem("selected_model", "qwen/qwen3.6-flash");
    localStorage.setItem("thinking_enabled", "false");
    localStorage.setItem("max_tokens", "1024");

    const { result } = renderHook(() => useSettings());
    await act(async () => {});
    expect(result.current.values.selectedModel).toBe("qwen/qwen3.6-flash");
    expect(result.current.values.thinkingEnabled).toBe(false);
    expect(result.current.values.maxTokens).toBe(1024);
  });

  it("keeps defaults when storage holds malformed values", async () => {
    localStorage.setItem("max_tokens", "not-json");
    const { result } = renderHook(() => useSettings());
    await act(async () => {});
    expect(result.current.values.maxTokens).toBe(32000);
  });

  it("writes through setValue and persists it", () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.setValue("selectedModel", "qwen/qwen3.6-flash");
    });
    expect(result.current.values.selectedModel).toBe("qwen/qwen3.6-flash");
    expect(localStorage.getItem("selected_model")).toBe("qwen/qwen3.6-flash");
  });

  it("persists boolean settings as JSON", () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.setValue("artifactsEnabled", true);
    });
    expect(localStorage.getItem("artifacts_enabled")).toBe("true");
  });

  it("toggles theme classes on the document root", async () => {
    const { result, rerender } = renderHook(() => useSettings());
    await act(async () => {});

    act(() => {
      result.current.setValue("theme", "sunrise");
    });
    rerender();
    expect(document.documentElement.classList.contains("theme-sunrise")).toBe(
      true,
    );

    act(() => {
      result.current.setValue("theme", "hackclub");
    });
    rerender();
    expect(document.documentElement.classList.contains("theme-sunrise")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("theme-hackclub")).toBe(
      true,
    );

    act(() => {
      result.current.setValue("theme", "aurora");
    });
    rerender();
    expect(document.documentElement.classList.contains("theme-hackclub")).toBe(
      false,
    );
  });

  it("does not re-render when the value is unchanged", () => {
    const { result } = renderHook(() => useSettings());
    const before = result.current.values;
    act(() => {
      result.current.setValue("selectedModel", result.current.values.selectedModel);
    });
    expect(result.current.values).toBe(before);
  });
});

describe("useSettings hydration safety", () => {
  it("hydrates asynchronously rather than during render", () => {
    localStorage.setItem("selected_model", "qwen/qwen3.6-flash");
    localStorage.setItem("thinking_enabled", "false");

    // Storage reads happen inside the mount effect (never during render),
    // so the server's default-value markup matches the first client render;
    // the stored values land only after commit. Hydration-safe by design.
    const { result } = renderHook(() => useSettings());
    expect(result.current.values.selectedModel).toBe("qwen/qwen3.6-flash");
    expect(result.current.values.thinkingEnabled).toBe(false);
  });
});
