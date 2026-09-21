"use client";

import { ChevronDown, ChevronUp, ExternalLink, Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SourcesBlock({ sources }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="mb-2 h-7 gap-1.5 rounded-lg px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>Sources ({sources.length})</span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </Button>
      {isExpanded && (
        <div className="space-y-1.5">
          {sources.map((source, index) => {
            const sourceKey =
              typeof source === "string"
                ? source
                : source.id ||
                  source.url ||
                  source.title ||
                  `source-${index + 1}`;

            return (
              <div
                key={sourceKey}
                className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg flex items-start gap-2"
              >
                <span className="text-muted-foreground/60 shrink-0">
                  {index + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  {typeof source === "string" ? (
                    <span>{source}</span>
                  ) : (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-4 decoration-blue-300 dark:decoration-blue-700 hover:decoration-blue-600 transition-colors break-all inline-flex items-center gap-1"
                    >
                      {source.title || source.url || `Source ${index + 1}`}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
