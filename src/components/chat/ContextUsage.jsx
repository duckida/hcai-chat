"use client";

import { Button } from "@/components/primitives/button";
import { Tooltip, TooltipTrigger } from "@/components/primitives/tooltip";
import { formatPrice } from "@/lib/pricing";
import { useModels } from "@/stores/models";

function formatNumber(n) {
  return n.toLocaleString();
}

export default function ContextUsage({ used, modelId, totalCost }) {
  const max = useModels((s) => (modelId ? s.contextWindows[modelId] || 0 : 0));

  if (!max || max <= 0) return null;

  const ratio = Math.min(used / max, 1);
  const percent = Math.round(ratio * 100);
  const size = 20;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ratio * circumference;

  let color = "var(--foreground)";
  let trackColor = "var(--muted)";
  if (percent >= 90) {
    color = "#ef4444";
    trackColor = "#fecaca";
  } else if (percent >= 75) {
    color = "#f59e0b";
    trackColor = "#fef3c7";
  }

  return (
    <TooltipTrigger>
      {/* RAC's Button rather than a bare element: the tooltip only wires hover
          and focus to a trigger it recognises. */}
      <Button
        variant="ghost"
        aria-label={`Context usage: ${percent}% used, ${formatNumber(used)} of ${formatNumber(max)}`}
        className="h-auto w-auto min-w-0 cursor-default shrink-0 bg-transparent p-0 hover:bg-transparent"
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg]"
          role="img"
          aria-label={`Context usage: ${formatNumber(used)} of ${formatNumber(max)}`}
        >
          <title>Context usage</title>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
      </Button>
      {/* Sideways, not below. The ring sits at the top of the screen, so a
          bottom-anchored panel lands squarely on the first thing the user
          came to read. */}
      <Tooltip placement="left top" offset={12} className="text-xs font-medium">
        <div className="flex flex-col gap-0.5">
          <span>{percent}% used</span>
          <span>
            {formatNumber(used)} out of {formatNumber(max)}
          </span>
          {totalCost != null && totalCost > 0 && (
            <span>Cost: {formatPrice(totalCost)}</span>
          )}
        </div>
      </Tooltip>
    </TooltipTrigger>
  );
}
