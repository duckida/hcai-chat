"use client";

import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    const viewportRef = React.useRef(null);

    React.useImperativeHandle(ref, () => ({
      set scrollTop(val) {
        if (viewportRef.current) viewportRef.current.scrollTop = val;
      },
      get scrollTop() {
        return viewportRef.current?.scrollTop || 0;
      },
      get scrollHeight() {
        return viewportRef.current?.scrollHeight || 0;
      },
      // Helper to scroll to the bottom of the viewport
      scrollToBottom() {
        if (viewportRef.current) {
          viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        }
      },
    }));

    return (
      <ScrollAreaPrimitive.Root
        data-slot="scroll-area"
        className={cn("relative min-h-0", className)}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          data-slot="scroll-area-viewport"
          className="h-full w-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    );
  },
);

ScrollArea.displayName = "ScrollArea";

function ScrollBar({ className, orientation = "vertical", ...props }) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
