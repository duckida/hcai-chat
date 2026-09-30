"use client";

import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeLatexDelimiters } from "@/lib/latex";
import ThinkingIndicator from "../ThinkingIndicator";
import Markdown from "./Markdown";

export default function ThinkingBlock({
  thinking,
  isStreaming = false,
  defaultView = "closed",
}) {
  const [isExpanded, setIsExpanded] = useState(defaultView === "open");

  useEffect(() => {
    setIsExpanded(defaultView === "open");
  }, [defaultView]);

  const normalizedThinking = useMemo(
    () => (thinking ? normalizeLatexDelimiters(thinking) : ""),
    [thinking],
  );

  if (!thinking && !isStreaming) return null;

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
          {normalizedThinking ? (
            <Markdown
              mode={isStreaming ? "stream" : "static"}
              streaming={isStreaming}
            >
              {normalizedThinking}
            </Markdown>
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
