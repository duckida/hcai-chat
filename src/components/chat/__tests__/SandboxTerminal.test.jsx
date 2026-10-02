import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SandboxTerminal from "../SandboxTerminal";
import { resetSettings, settingsStore } from "@/stores/settings";

/**
 * The transcript moved here from the thread, and so did its gates: both
 * display settings decide what a *terminal* shows, and they stay independent —
 * hiding output must not hide the command, or the toggle would be a lie.
 * Store-seeded the way the app does it, because SandboxTerminal reads the
 * settings store itself rather than being handed flags.
 */
function renderTerminal({ runs, settings } = {}) {
  resetSettings();
  if (settings) settingsStore.setState(settings);
  return render(<SandboxTerminal runs={runs} />);
}

const completedRun = {
  key: "persisted-0",
  tool: "execute_code",
  code: "print('hello from the sandbox')",
  stdout: "hello from the sandbox",
  stderr: "",
  exitCode: 0,
  status: "complete",
};

afterEach(() => {
  resetSettings();
});

describe("SandboxTerminal", () => {
  it("renders a run at the shell prompt with its output and exit status", () => {
    renderTerminal({ runs: [completedRun] });

    // The prompt and the command share one line, like typed input.
    expect(screen.getByText("/workspace $")).toBeInTheDocument();
    expect(
      screen.getByText("print('hello from the sandbox')"),
    ).toBeInTheDocument();
    expect(screen.getByText("hello from the sandbox")).toBeInTheDocument();
    expect(screen.getByText("exit 0")).toBeInTheDocument();
  });

  it("marks a failing run's exit status and stderr as failures", () => {
    renderTerminal({
      runs: [
        {
          key: "persisted-0",
          tool: "run_command",
          code: "false",
          stdout: "",
          stderr: "Traceback: most recent call last",
          exitCode: 1,
          status: "complete",
        },
      ],
    });

    expect(screen.getByText("exit 1")).toBeInTheDocument();
    expect(
      screen.getByText("Traceback: most recent call last"),
    ).toBeInTheDocument();
  });

  it("reports a live run as running, with no exit status yet", () => {
    renderTerminal({
      runs: [
        {
          key: "live-0",
          tool: "run_command",
          code: "npm install",
          stdout: "",
          stderr: "",
          exitCode: null,
          status: "running",
        },
      ],
    });

    expect(screen.getByText("running…")).toBeInTheDocument();
    expect(screen.queryByText(/^exit/)).toBeNull();
  });

  describe("display settings", () => {
    it("shows stdout when the setting is on", () => {
      renderTerminal({
        runs: [completedRun],
        settings: { showSandboxOutput: true, showSandboxCode: true },
      });
      expect(screen.getByText("hello from the sandbox")).toBeInTheDocument();
    });

    it("hides stdout when the setting is off", () => {
      renderTerminal({
        runs: [completedRun],
        settings: { showSandboxOutput: false, showSandboxCode: true },
      });
      expect(screen.queryByText("hello from the sandbox")).toBeNull();
      // The code is a separate setting and is unaffected.
      expect(
        screen.getByText("print('hello from the sandbox')"),
      ).toBeInTheDocument();
    });

    it("hides stderr too, so a failing command cannot leak through", () => {
      renderTerminal({
        runs: [
          {
            key: "persisted-0",
            tool: "run_command",
            code: "false",
            stdout: "",
            stderr: "Traceback: most recent call last",
            exitCode: 1,
            status: "complete",
          },
        ],
        settings: { showSandboxOutput: false, showSandboxCode: true },
      });
      expect(
        screen.queryByText("Traceback: most recent call last"),
      ).toBeNull();
    });

    it("hides the command without hiding its output", () => {
      renderTerminal({
        runs: [completedRun],
        settings: { showSandboxCode: false, showSandboxOutput: true },
      });
      expect(
        screen.queryByText("print('hello from the sandbox')"),
      ).toBeNull();
      expect(screen.getByText("hello from the sandbox")).toBeInTheDocument();
    });
  });

  it("exposes the log as a labelled, focusable scroll region", () => {
    renderTerminal({ runs: [completedRun] });
    // A scrollable area with no label and no focus is invisible to keyboard
    // and landmark navigation (WCAG 2.1.1).
    const region = screen.getByLabelText("Cloud sandbox terminal");
    expect(region).toHaveAttribute("tabindex", "0");
  });
});
