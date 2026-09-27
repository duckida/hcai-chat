"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  ListBox,
  ListBoxItem,
  Popover,
  SelectionIndicator,
  Select as SelectPrimitive,
  SelectValue as SelectValuePrimitive,
  SharedElementTransition,
} from "react-aria-components";

import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/utils";

function Select({ className, ...props }) {
  return (
    <SharedElementTransition>
      <SelectPrimitive
        data-slot="select"
        className={cn("inline-flex", className)}
        {...props}
      />
    </SharedElementTransition>
  );
}

function SelectValue({ className, ...props }) {
  return (
    <SelectValuePrimitive
      data-slot="select-value"
      className={cn("[&>span]:line-clamp-1", className)}
      {...props}
    />
  );
}

function SelectTrigger({ className, children, ...props }) {
  return (
    <Button
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-3xl border border-transparent bg-input/50 px-3 py-1 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 opacity-50" />
    </Button>
  );
}

function SelectPopover({ className, children, align = "bottom", ...props }) {
  return (
    <Popover
      data-slot="select-content"
      className={cn(
        "relative z-50 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-4xl border border-border bg-popover text-popover-foreground shadow-xl animate-in duration-100 fade-in-0",
        className,
      )}
      align={align}
      {...props}
    >
      <ListBox data-slot="select-list" className="p-1 outline-none">
        {children}
      </ListBox>
    </Popover>
  );
}

function SelectItem({ className, children, textValue, ...props }) {
  const resolvedTextValue =
    textValue ?? (typeof children === "string" ? children : undefined);
  return (
    <ListBoxItem
      data-slot="select-item"
      textValue={resolvedTextValue}
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-3xl py-1.5 pr-8 pl-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-hovered:bg-accent data-hovered:text-accent-foreground data-focused:bg-accent data-focused:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
        <SelectionIndicator>
          <Check className="size-4" />
        </SelectionIndicator>
      </span>
      {children}
    </ListBoxItem>
  );
}

export { Select, SelectItem, SelectPopover, SelectTrigger, SelectValue };
