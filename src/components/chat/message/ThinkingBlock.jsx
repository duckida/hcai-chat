"use client";

import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/primitives/button";
import { normalizeLatexDelimiters } from "@/lib/latex";
import ThinkingIndicator from "../ThinkingIndicator";
import Markdown from "./Markdown";
import ToolChip from "./ToolChip";

/**
 * Interleave reasoning text with the tool calls that interrupted it.
 *
 * Each chip records the length of the thinking buffer at the moment its call
 * arrived, so the split points are *event positions*, not render positions:
 * the segments come out in the order the model produced them, and two chips
 * at the same offset (calls made back to back) sit side by side with no text
 * between. Offsets are clamped to the text — a chip can never fall out of the
 * block — and a sort makes delivery order irrelevant to display order.
 *
 * Latency is normalized per segment after the split. A `$$…$$` environment
 * could in principle straddle a chip, but a tool call is not a character, and
 * models do not open a formula, run a command, and close the formula.
 */
export function splitThinking(text = "", chips = []) {
  if (!chips || chips.length === 0) {
    return text ? [{ kind: "text", text, key: "t0" }] : [];
  }
  const marks = chips
    .map((chip, order) => ({
      chip,
      order,
      at: Number.isFinite(chip?.at)
        ? Math.min(Math.max(chip.at, 0), text.length)
        : text.length,
    }))
    .sort((a, b) => a.at - b.at || a.order - b.order);

  const segments = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.at > cursor) {
      segments.push({
        kind: "text",
        text: text.slice(cursor, mark.at),
        // The offset the slice starts at: stable for as long as the text in
        // front of it is, which is exactly how the segments grow.
        key: `t${cursor}`,
      });
      cursor = mark.at;
    }
    // Chips are append-only in the stream, so at + arrival order is a key
    // that never collides and never shifts an earlier chip.
    segments.push({
      kind: "chip",
      chip: mark.chip,
      key: `c${mark.at}-${mark.order}`,
    });
  }
  if (cursor < text.length) {
    segments.push({
      kind: "text",
      text: text.slice(cursor),
      key: `t${cursor}`,
    });
  }
  return segments;
}

export default function ThinkingBlock({
  thinking,
  chips,
  isStreaming = false,
  defaultView = "closed",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultView === "open");

  useEffect(() => {
    setIsExpanded(defaultView === "open");
  }, [defaultView]);

  const hasChips = !!(chips && chips.length > 0);
  const segments = useMemo(
    () => splitThinking(thinking, chips),
    [thinking, chips],
  );

  // Chips-only is still a block: a tool call can arrive before the model
  // writes its first reasoned word, and that call belongs somewhere.
  if (!thinking && !hasChips && !isStreaming) return null;

  return (
    <div className="mb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7 px-2.5 rounded-lg"
      >
        {isStreaming ? (
          <ThinkingIndicator size="sm" />
        ) : (
          <Brain className="w-3.5 h-3.5" />
        )}
        <span className="font-medium">Thinking</span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </Button>
      {isExpanded && (
        <div className="mt-2 ml-1 p-4 bg-muted rounded-xl border border-border text-sm text-muted-foreground leading-relaxed overflow-x-auto">
          {thinking || hasChips ? (
            segments.map((segment, i) =>
              segment.kind === "chip" ? (
                <ToolChip key={segment.key} chip={segment.chip} />
              ) : segment.text ? (
                // Only the tail is still growing; everything before a chip is
                // frozen text and renders statically.
                <Markdown
                  key={segment.key}
                  mode={
                    isStreaming && i === segments.length - 1
                      ? "stream"
                      : "static"
                  }
                  streaming={isStreaming && i === segments.length - 1}
                >
                  {normalizeLatexDelimiters(segment.text)}
                </Markdown>
              ) : null,
            )
          ) : (
            <span className="text-muted-foreground inline-flex items-center">
              <ThinkingIndicator
                label="Thinking"
                size="sm"
                className="text-muted-foreground"
              />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
