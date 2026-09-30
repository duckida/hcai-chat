"use client";

import { XIcon } from "lucide-react";
import { createContext, useContext, useId } from "react";
import {
  Dialog as DialogPrimitive,
  Heading,
  Modal,
  ModalOverlay,
  Text,
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

/**
 * A dialog's accessible name has to come from inside the dialog, which is a
 * problem when the design does not want the title at the top — the settings
 * dialog puts "Settings" in its own sidebar, above the section list rather
 * than above the content. These are RAC's `Heading` and description `Text`, and
 * the dialog wires them up on sight, so a title placed by hand does exactly
 * what the `title` prop does.
 *
 * Use these *or* the `title`/`description` props, never both: two headings in
 * one dialog leaves which one names it up to the renderer.
 */
function DialogTitle({ className, ...props }) {
  return (
    <Heading
      data-slot="dialog-title"
      // RAC links `aria-labelledby` to a heading *only* when it declares this
      // slot. A plain <Heading> inside a dialog renders a heading that names
      // nothing, which is the exact failure this component exists to prevent.
      slot="title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }) {
  return (
    <Text
      data-slot="dialog-description"
      slot="description"
      className={cn("text-sm text-muted-foreground", className)}
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
        "fixed inset-0 isolate z-50 animate-hcai-fade-in-fast supports-backdrop-filter:backdrop-blur-sm",
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

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
