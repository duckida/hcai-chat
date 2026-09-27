"use client";

import { Popover as PopoverPrimitive } from "react-aria-components";

import { cn } from "@/lib/utils";

const popoverClasses =
  "z-50 overflow-x-hidden overflow-y-auto rounded-3xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 animate-in duration-100 fade-in-0 outline-none dark:ring-foreground/10";

function Popover({ className, children, ...props }) {
  return (
    <PopoverPrimitive
      data-slot="popover"
      className={cn(popoverClasses, className)}
      {...props}
    >
      {children}
    </PopoverPrimitive>
  );
}

export { Popover };
