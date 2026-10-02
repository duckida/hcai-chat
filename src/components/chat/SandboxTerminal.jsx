"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useThreadScroll } from "@/hooks/use-thread-scroll";
import { useSettings } from "@/stores/settings";
import ThinkingIndicator from "./ThinkingIndicator";

// The sandbox workspace, mirrored client-side. `WORKSPACE` itself lives in
// `src/lib/sandbox.js`, which API routes import and which pulls in the E2B SDK
// — importing it here would drag that bundle into the client (it is
// lazy-loaded on the server for exactly that reason).
const PROMPT = "/workspace $";

const selectSandboxDisplay = (state) => ({
  showSandboxCode: state.showSandboxCode,
  showSandboxOutput: state.showSandboxOutput,
});

/**
 * One run of the log: the input at the shell prompt, its output, and how it
 * ended. Both display settings gate their own half, independently — turning
 * off output must not hide the command, or the toggle would be a lie.
 */
function TerminalRun({ run, showSandboxCode, showSandboxOutput }) {
  const isRunning = run.status === "running" || run.status === "writing";

  return (
    <div className="space-y-1 min-w-0">
      {showSandboxCode && run.code && (
        <pre className="whitespace-pre-wrap break-words">
          <span className="text-green-600 dark:text-green-400">{PROMPT}</span>{" "}
          <span className="text-foreground">{run.code}</span>
        </pre>
      )}
      {showSandboxOutput && run.stdout && (
        <pre className="whitespace-pre-wrap break-words text-foreground/80">
          {run.stdout}
        </pre>
      )}
      {showSandboxOutput && run.stderr && (
        <pre className="whitespace-pre-wrap break-words text-red-500">
          {run.stderr}
        </pre>
      )}
      {isRunning && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ThinkingIndicator size="sm" />
          <span className="font-mono">
            {run.status === "writing" ? "writing…" : "running…"}
          </span>
        </div>
      )}
      {run.status === "complete" && run.exitCode != null && (
        <div
          className={`flex items-center gap-1.5 font-mono ${
            run.exitCode === 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-500"
          }`}
        >
          {run.exitCode === 0 ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          <span>exit {run.exitCode}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The Cloud sandbox panel body: every command the conversation ran, at a
 * shell prompt, newest at the bottom. Display-only — the commands happened in
 * the E2B sandbox, and this is their transcript, not a shell you can type
 * into.
 *
 * It follows its own tail exactly the way the thread does (same
 * `useThreadScroll`): new output pulls the view down unless the reader has
 * scrolled away to look at an earlier run, and a finished run hands the view
 * back so the next one starts at the bottom.
 */
export default function SandboxTerminal({ runs = [] }) {
  const { showSandboxCode, showSandboxOutput } =
    useSettings(selectSandboxDisplay);

  const isActive = runs.some(
    (run) => run.status === "running" || run.status === "writing",
  );
  const { scrollRef, userScrolledAway, handleScroll, scrollToBottom } =
    useThreadScroll({ isStreaming: isActive });

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* biome-ignore-start lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable for arrow-key scrolling (WCAG 2.1.1) */}
      <section
        ref={scrollRef}
        onScroll={handleScroll}
        aria-label="Cloud sandbox terminal"
        tabIndex={0}
        className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-4 font-mono text-xs leading-relaxed selection:bg-accent"
      >
        <div className="space-y-4 min-w-0">
          {runs.map((run) => (
            <TerminalRun
              key={run.key}
              run={run}
              showSandboxCode={showSandboxCode}
              showSandboxOutput={showSandboxOutput}
            />
          ))}
        </div>
      </section>
      {/* biome-ignore-end lint/a11y/noNoninteractiveTabindex: see above */}
      {userScrolledAway && isActive && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-background border border-border shadow-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
