"use client";

import { XIcon } from "lucide-react";
import {
  Dialog as DialogPrimitive,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";

import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/utils";

/**
 * A panel pinned to one edge of the screen, for navigation that will not fit
 * in the page.
 *
 * Controlled by its caller instead of by a trigger child: the header already
 * owns whether the sheet is open, and a `DialogTrigger` would want to own it a
 * second time. Fades rather than slides — see the anti-jank note in
 * REWRITE.md; nothing should animate on mount while the page behind it
 * re-lays out.
 */
export default function Sheet({
  open,
  onOpenChange,
  side = "left",
  title,
  className,
  widthClassName = "w-[85vw] max-w-sm",
  showCloseButton = true,
  closeLabel = "Close",
  children,
}) {
  return (
    <ModalOverlay
      data-slot="sheet-overlay"
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 isolate z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-sm"
    >
      <Modal
        // The width belongs here, not on the dialog below: this box is what
        // paints `bg-background`, so a narrower dialog left the rest of it
        // showing as a blank strip beside the panel.
        className={cn(
          "fixed z-50 animate-hcai-fade-in outline-none",
          widthClassName,
          side === "left"
            ? "inset-y-0 left-0 h-full border-r border-border bg-background shadow-xl"
            : "inset-y-0 right-0 h-full border-l border-border bg-background shadow-xl",
        )}
      >
        <DialogPrimitive
          data-slot="sheet-content"
          className={cn("flex h-full min-h-0 flex-col outline-none", className)}
        >
          {title ? (
            <Heading slot="title" className="sr-only">
              {title}
            </Heading>
          ) : null}
          {children}
        </DialogPrimitive>

        {showCloseButton ? (
          <Button
            data-slot="sheet-close"
            variant="ghost"
            size="icon-sm"
            onPress={() => onOpenChange?.(false)}
            className="absolute top-4 right-4"
          >
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </Button>
        ) : null}
      </Modal>
    </ModalOverlay>
  );
}
