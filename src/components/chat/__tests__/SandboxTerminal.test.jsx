import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SandboxTerminal from "../SandboxTerminal";
import { resetSettings, settingsStore } from "@/stores/settings";

/**
 * The transcript always shows a complete run. Legacy visibility preferences
 * are still seeded here to ensure old saved values cannot hide either half.
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

  describe("complete transcript", () => {
    it("shows both the command and output when legacy visibility settings are off", () => {
      renderTerminal({
        runs: [completedRun],
        settings: { showSandboxOutput: false, showSandboxCode: true },
      });
      expect(screen.getByText("hello from the sandbox")).toBeInTheDocument();
      expect(
        screen.getByText("print('hello from the sandbox')"),
      ).toBeInTheDocument();
    });

    it("shows stderr even when the legacy output setting is off", () => {
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
        screen.getByText("Traceback: most recent call last"),
      ).toBeInTheDocument();
    });

    it("shows the command even when the legacy input setting is off", () => {
      renderTerminal({
        runs: [completedRun],
        settings: { showSandboxCode: false, showSandboxOutput: true },
      });
      expect(
        screen.getByText("print('hello from the sandbox')"),
      ).toBeInTheDocument();
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
