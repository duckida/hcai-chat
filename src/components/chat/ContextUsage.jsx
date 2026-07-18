"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatNumber(n) {
  return n.toLocaleString();
}

export default function ContextUsage({ used, max }) {
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center cursor-default shrink-0">
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
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium">
          <div className="flex flex-col gap-0.5">
            <span>{percent}% used</span>
            <span className="text-foreground/60">
              {formatNumber(used)} out of {formatNumber(max)}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
