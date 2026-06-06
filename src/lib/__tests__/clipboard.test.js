import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "../clipboard";

describe("copyToClipboard", () => {
  let originalClipboard;
  let originalExecCommand;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    if (originalClipboard === undefined) {
      delete navigator.clipboard;
    } else {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    }
    document.execCommand = originalExecCommand;
  });

  it("does nothing when window is undefined (SSR safety)", async () => {
    const originalWindow = globalThis.window;
    // jsdom always has window, so we test via absence of effect when clipboard API throws
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    document.execCommand = vi.fn(() => true);

    await copyToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    // Restore
    globalThis.window = originalWindow;
  });

  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    await copyToClipboard("hello world");

    expect(writeText).toHaveBeenCalledWith("hello world");
  });

  it("falls back to a hidden textarea when Clipboard API throws", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    document.execCommand = vi.fn(() => true);

    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    await copyToClipboard("fallback text");

    expect(writeText).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back when Clipboard API is missing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    document.execCommand = vi.fn(() => true);

    const appendSpy = vi.spyOn(document.body, "appendChild");

    await copyToClipboard("another text");

    expect(appendSpy).toHaveBeenCalled();
    const appendedNode = appendSpy.mock.calls[0][0];
    expect(appendedNode.tagName).toBe("TEXTAREA");
    expect(appendedNode.value).toBe("another text");
  });

  it("removes the fallback textarea even if execCommand throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    document.execCommand = vi.fn(() => {
      throw new Error("copy failed");
    });
    const removeSpy = vi.spyOn(document.body, "removeChild");

    await expect(copyToClipboard("crash")).rejects.toThrow("copy failed");
    expect(removeSpy).toHaveBeenCalled();
  });
});
