"use client";

import { Clock, DollarSign, Hash, Zap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { calcCost, formatPrice } from "@/lib/pricing";

export default function ResponseMetrics({ usage, duration }) {
  if (!usage) return null;

  const totalTokens = usage.inputTokens + usage.outputTokens;
  const tokensPerSecond = duration > 0 ? usage.outputTokens / duration : 0;
  const cost = usage.model
    ? calcCost(usage.model, usage.inputTokens, usage.outputTokens)
    : null;

  const formatDuration = (seconds) => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(0);
    return `${minutes}m ${secs}s`;
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 hover:text-slate-700 transition-colors cursor-help"
            >
              <Hash className="w-3.5 h-3.5" />
              <span>{totalTokens} tokens</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-xs">
            <p className="font-medium">Token Usage</p>
            <p>Input: {usage.inputTokens}</p>
            <p>Output: {usage.outputTokens}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 hover:text-slate-700 transition-colors cursor-help"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(duration)}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Generation time
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 hover:text-slate-700 transition-colors cursor-help"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{tokensPerSecond.toFixed(2)} t/s</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Tokens per second (speed)
          </TooltipContent>
        </Tooltip>

        {cost !== null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 hover:text-slate-700 transition-colors cursor-help"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>{formatPrice(cost)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p className="font-medium">Cost</p>
              <p>Model: {usage.model}</p>
              <p>Total: {formatPrice(cost)}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
