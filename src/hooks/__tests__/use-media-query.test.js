import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop, useMediaQuery } from "@/hooks/use-media-query";

function setViewport(matches) {
  const listeners = new Set();
  const media = {
    matches,
    media: "(min-width: 768px)",
    addEventListener: (type, listener) => listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  return { media, listeners };
}

describe("useMediaQuery", () => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      media: "(min-width: 768px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false before mounting (SSR-safe default)", () => {
    const { result } = renderHook(() => useMediaQuery());
    expect(result.current).toBe(false);
  });

  it("reflects the live match after mount", () => {
    setViewport(true);
    const { result } = renderHook(() => useMediaQuery());
    expect(result.current).toBe(true);
  });

  it("updates when the query result changes", () => {
    const { media, listeners } = setViewport(false);
    const { result } = renderHook(() => useMediaQuery());
    expect(result.current).toBe(false);

    act(() => {
      media.matches = true;
      for (const listener of listeners) listener({ matches: true });
    });
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const removeEventListener = vi.fn();
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      media: "(min-width: 768px)",
      addEventListener: vi.fn(),
      removeEventListener,
    });

    const { unmount } = renderHook(() => useMediaQuery());
    unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });
});

describe("useIsDesktop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks the 768px breakpoint", () => {
    setViewport(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("is false below the breakpoint", () => {
    setViewport(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });
});
