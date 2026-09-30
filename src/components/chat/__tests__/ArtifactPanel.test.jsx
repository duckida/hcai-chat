import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArtifactPanel from "../ArtifactPanel";

const ARTIFACT = "<div>hello artifact</div>";

function renderPanel(props = {}) {
  return render(
    <ArtifactPanel
      artifacts={[ARTIFACT]}
      isOpen={false}
      onToggle={vi.fn()}
      onFullscreenToggle={vi.fn()}
      {...props}
    />,
  );
}

describe("ArtifactPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("renders nothing when there are no artifacts at all", () => {
    const { container } = renderPanel({ artifacts: [], isOpen: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the toggle when closed and the panel when open", () => {
    const { rerender } = renderPanel();
    expect(
      screen.getByTitle("Open artifact panel"),
    ).toBeInTheDocument();

    rerender(
      <ArtifactPanel
        artifacts={[ARTIFACT]}
        isOpen
        onToggle={vi.fn()}
        onFullscreenToggle={vi.fn()}
      />,
    );
    expect(
      screen.queryByTitle("Open artifact panel"),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("Copy code")).toBeInTheDocument();
  });

  it("previews the artifact in a sandboxed iframe", () => {
    renderPanel({ isOpen: true });

    const frame = screen.getByTitle("Artifact Preview");
    expect(frame).toHaveAttribute("srcdoc", ARTIFACT);
    // allow-scripts without allow-same-origin: the preview can run but cannot
    // reach this app's storage.
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("shows the artifact source on the code tab", async () => {
    const user = userEvent.setup();
    renderPanel({ isOpen: true });

    await user.click(screen.getByRole("button", { name: /^code$/i }));

    expect(
      screen.queryByTitle("Artifact Preview"),
    ).not.toBeInTheDocument();
    // Streamdown is a passthrough in tests, so the fenced block it received is
    // the text that lands here.
    expect(document.querySelector(".artifact-code").textContent).toContain(
      "<div>hello artifact</div>",
    );
  });

  it("marks the active tab as pressed", async () => {
    const user = userEvent.setup();
    renderPanel({ isOpen: true });

    const preview = screen.getByRole("button", { name: /^preview$/i });
    const code = screen.getByRole("button", { name: /^code$/i });
    expect(preview).toHaveAttribute("aria-pressed", "true");
    expect(code).toHaveAttribute("aria-pressed", "false");

    await user.click(code);
    expect(code).toHaveAttribute("aria-pressed", "true");
    expect(preview).toHaveAttribute("aria-pressed", "false");
  });

  describe("resizing", () => {
    const handle = () => screen.getByRole("separator", { name: /resize/i });

    it("is a labelled separator that reports its width", () => {
      renderPanel({ isOpen: true });

      const separator = handle();
      expect(separator).toHaveAttribute("aria-orientation", "vertical");
      expect(separator).toHaveAttribute("aria-valuenow", "480");
    });

    it("takes arrow keys, in larger steps with shift", async () => {
      const user = userEvent.setup();
      renderPanel({ isOpen: true });

      await user.click(handle());
      fireEvent.keyDown(handle(), { key: "ArrowLeft" });
      await waitFor(() =>
        expect(handle()).toHaveAttribute("aria-valuenow", "490"),
      );

      fireEvent.keyDown(handle(), { key: "ArrowLeft", shiftKey: true });
      await waitFor(() =>
        expect(handle()).toHaveAttribute("aria-valuenow", "540"),
      );

      // Arrow right widens on the other side: the panel's edge is on its left.
      fireEvent.keyDown(handle(), { key: "ArrowRight" });
      await waitFor(() =>
        expect(handle()).toHaveAttribute("aria-valuenow", "530"),
      );
    });

    it("never lets the panel be dragged below the minimum", async () => {
      const user = userEvent.setup();
      renderPanel({ isOpen: true });

      // The panel's drag edge is on its left, so ArrowRight is what narrows
      // it — arrow direction here is the opposite of a right-hand sidebar.
      await user.click(handle());
      for (let i = 0; i < 40; i++) {
        fireEvent.keyDown(handle(), { key: "ArrowRight" });
      }

      await waitFor(() =>
        expect(handle()).toHaveAttribute("aria-valuenow", "320"),
      );
    });

    it("releases the document cursor lock when the gesture is cancelled", () => {
      // A pointercancel — the browser taking the gesture over, a scroll
      // starting — used to leave the page stuck in resize mode forever,
      // because only pointerup ended a drag.
      renderPanel({ isOpen: true });

      fireEvent.pointerDown(handle(), { clientX: 1000, pointerId: 1 });
      expect(document.body.style.cursor).toBe("col-resize");
      expect(document.body.style.userSelect).toBe("none");

      fireEvent.pointerCancel(handle(), { pointerId: 1 });

      expect(document.body.style.cursor).toBe("");
      expect(document.body.style.userSelect).toBe("");
    });

    it("releases the document cursor lock when the panel unmounts mid-drag", () => {
      const { unmount } = renderPanel({ isOpen: true });

      fireEvent.pointerDown(handle(), { clientX: 1000, pointerId: 1 });
      expect(document.body.style.cursor).toBe("col-resize");

      unmount();

      expect(document.body.style.cursor).toBe("");
      expect(document.body.style.userSelect).toBe("");
    });

    it("persists a width the user chose", async () => {
      const user = userEvent.setup();
      renderPanel({ isOpen: true });

      await user.click(handle());
      fireEvent.keyDown(handle(), { key: "ArrowLeft", shiftKey: true });

      await waitFor(() =>
        expect(localStorage.getItem("hcai_artifact_panel_width")).toBe("530"),
      );
    });
  });

  it("shows artifact markup as inert code, never as live HTML", async () => {
    // The code view fences the source, so generated markup is escaped text.
    // This is why the panel's own copy of CustomLink was dead code: there was
    // never a link here to make safe. The live version of that markup is the
    // sandboxed iframe, which has no same-origin access.
    const user = userEvent.setup();
    renderPanel({
      artifacts: ['<img src=x onerror="window.pwned=1">'],
      isOpen: true,
    });

    await user.click(screen.getByRole("button", { name: /^code$/i }));

    const code = document.querySelector(".artifact-code");
    expect(code.textContent).toContain('<img src=x onerror="window.pwned=1">');
    expect(code.querySelector("img")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(window.pwned).toBeUndefined();
  });
});
