"use client";

import { CheckCircle2, Terminal, XCircle } from "lucide-react";
import { useState } from "react";
import ThinkingIndicator from "../ThinkingIndicator";
import SandboxFiles from "./SandboxFiles";

const LINE_LIMIT = 4;

/**
 * Collapsible sandbox tool block: code (truncated to 4 lines with an
 * "show all" toggle), stdout/stderr, exit status, and the generated-file
 * list once the run completes.
 */
export default function StreamingSandboxBlock({
  tool,
  showSandboxCode = true,
  showSandboxOutput = true,
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullCode, setShowFullCode] = useState(false);

  const isRunning = tool.status === "running" || tool.status === "writing";
  const isComplete = tool.status === "complete";
  const hasOutput = tool.stdout || tool.stderr;

  const codeLines = (tool.code || "").split("\n");
  const isLongCode = codeLines.length > LINE_LIMIT;
  const displayCode =
    showFullCode || !isLongCode
      ? tool.code
      : `${codeLines.slice(0, LINE_LIMIT).join("\n")}\n···`;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-muted/50">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors bg-muted/30"
      >
        <Terminal className="w-3.5 h-3.5 shrink-0" />
        <span className="font-semibold">Sandbox</span>
        {isRunning && (
          <ThinkingIndicator size="sm" className="text-muted-foreground ml-1" />
        )}
        {isComplete && tool.exitCode === 0 && (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />
        )}
        {isComplete && tool.exitCode !== 0 && (
          <XCircle className="w-3.5 h-3.5 text-red-500 ml-1" />
        )}
        {hasOutput && (
          <span className="text-[11px] text-muted-foreground/70 ml-auto">
            {isExpanded ? "Hide" : "Show"} output
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="p-3 space-y-2 border-t border-border">
          {showSandboxCode && (
            <>
              <pre className="text-xs leading-relaxed bg-muted p-2.5 rounded-lg overflow-x-auto text-foreground/90 whitespace-pre-wrap font-mono">
                {displayCode}
              </pre>
              {isLongCode && (
                <button
                  type="button"
                  onClick={() => setShowFullCode(!showFullCode)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showFullCode
                    ? "Show less"
                    : `Show all (${codeLines.length} lines)`}
                </button>
              )}
            </>
          )}
          {isRunning && !tool.stdout && !tool.stderr && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {tool.status === "writing" ? "Writing code..." : "Running..."}
              </span>
              <ThinkingIndicator size="sm" className="text-muted-foreground" />
            </div>
          )}
          {showSandboxOutput && tool.stdout && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Output
              </div>
              <pre className="text-xs leading-relaxed bg-background p-2.5 rounded-lg overflow-x-auto text-foreground/80 whitespace-pre-wrap font-mono">
                {tool.stdout}
              </pre>
            </div>
          )}
          {showSandboxOutput && tool.stderr && (
            <div>
              <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                Error
              </div>
              <pre className="text-xs leading-relaxed bg-red-50 dark:bg-red-950/50 p-2.5 rounded-lg overflow-x-auto text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">
                {tool.stderr}
              </pre>
            </div>
          )}
        </div>
      )}
      {isComplete && tool.conversationId && (
        <SandboxFiles
          conversationId={tool.conversationId}
          sandboxId={tool.sandboxId}
        />
      )}
    </div>
  );
}
