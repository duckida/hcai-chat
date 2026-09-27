"use client";

import {
  OverlayArrow,
  Tooltip as TooltipPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
} from "react-aria-components";

import { cn } from "@/lib/utils";

const tooltipClasses =
  "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 animate-in duration-100 fade-in-0 outline-none **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-lg";

function TooltipTrigger({ ...props }) {
  return <TooltipTriggerPrimitive data-slot="tooltip-trigger" {...props} />;
}

function Tooltip({ className, children, offset = 0, ...props }) {
  return (
    <TooltipPrimitive
      data-slot="tooltip"
      offset={offset}
      className={cn(tooltipClasses, className)}
      {...props}
    >
      {children}
    </TooltipPrimitive>
  );
}

function TooltipArrow({ className, ...props }) {
  return (
    <OverlayArrow
      data-slot="tooltip-arrow"
      className={cn(
        "z-50 size-2.5 rotate-45 rounded-[2px] bg-foreground fill-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Tooltip, TooltipArrow, TooltipTrigger };
