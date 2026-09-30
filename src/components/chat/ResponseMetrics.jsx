"use client";

import { Clock, DollarSign, Hash, Zap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/pricing";

/**
 * A missing or nonsensical duration renders as a dash rather than the
 * "NaNm NaNs" the arithmetic below would otherwise produce — a metrics strip
 * is not the place to show a bug to the user.
 */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0);
  return `${minutes}m ${secs}s`;
}

function Metric({ icon: Icon, value, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-help"
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{value}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export default function ResponseMetrics({ usage, duration }) {
  if (!usage) return null;

  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;
  const totalTokens = inputTokens + outputTokens;
  const tokensPerSecond =
    usage.tokensPerSecond != null
      ? usage.tokensPerSecond
      : duration > 0
        ? outputTokens / duration
        : 0;
  const cost = usage.cost ?? null;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground px-1">
        <Metric icon={Hash} value={`${totalTokens} tokens`}>
          <p className="font-medium">Token Usage</p>
          <p>Input: {inputTokens}</p>
          <p>Output: {outputTokens}</p>
        </Metric>

        <Metric icon={Clock} value={formatDuration(duration)}>
          Generation time
        </Metric>

        <Metric icon={Zap} value={`${tokensPerSecond.toFixed(2)} t/s`}>
          Tokens per second (speed)
        </Metric>

        {cost !== null && (
          <Metric icon={DollarSign} value={formatPrice(cost)}>
            <p className="font-medium">Cost</p>
            <p>Model: {usage.model}</p>
            <p>Total: {formatPrice(cost)}</p>
          </Metric>
        )}
      </div>
    </TooltipProvider>
  );
}
