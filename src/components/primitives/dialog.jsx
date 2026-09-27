"use client";

import { XIcon } from "lucide-react";
import { createContext, useContext, useId } from "react";
import {
  Dialog as DialogPrimitive,
  Modal,
  ModalOverlay,
} from "react-aria-components";

import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/utils";

const DialogContext = createContext({ close: () => {} });

function DialogClose({ variant = "outline", className, ...props }) {
  const { close } = useContext(DialogContext);
  return (
    <Button
      data-slot="dialog-close"
      variant={variant}
      className={className}
      onPress={close}
      {...props}
    />
  );
}

function DialogHeader({ className, ...props }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function Dialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  children,
  className,
  showCloseButton = true,
  closeLabel = "Close",
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const close = () => onOpenChange?.(false);

  return (
    <ModalOverlay
      data-slot="dialog-overlay"
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      className={cn(
        "fixed inset-0 isolate z-50 animate-in bg-black/30 fade-in-0 duration-100 supports-backdrop-filter:backdrop-blur-sm",
      )}
    >
      <Modal className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
        <DialogContext.Provider value={{ close }}>
          <DialogPrimitive
            data-slot="dialog-content"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            aria-label={title ? undefined : label}
            className={cn(
              "relative grid w-full max-w-[calc(100%-2rem)] gap-6 rounded-4xl bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none sm:max-w-md dark:ring-foreground/10",
              className,
            )}
          >
            {title ? (
              <DialogHeader>
                <span
                  data-slot="dialog-title"
                  id={titleId}
                  className="font-heading text-base leading-none font-medium"
                >
                  {title}
                </span>
                {description ? (
                  <span
                    data-slot="dialog-description"
                    id={descriptionId}
                    className="text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground"
                  >
                    {description}
                  </span>
                ) : null}
              </DialogHeader>
            ) : null}

            {children}

            {showCloseButton ? (
              <DialogClose
                variant="ghost"
                className="absolute top-4 right-4 bg-secondary"
                size="icon-sm"
              >
                <XIcon />
                <span className="sr-only">{closeLabel}</span>
              </DialogClose>
            ) : null}
          </DialogPrimitive>
        </DialogContext.Provider>
      </Modal>
    </ModalOverlay>
  );
}

export { Dialog, DialogClose, DialogFooter, DialogHeader };
