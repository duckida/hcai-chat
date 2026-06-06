"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CustomLink({ href, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const isExternal = href.startsWith("http");

  const handleClick = (e) => {
    if (isExternal) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <>
      <a
        href={href}
        onClick={handleClick}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-4 decoration-blue-300 dark:decoration-blue-700 hover:decoration-blue-600 transition-colors inline-flex items-center gap-1"
      >
        {children}
        {isExternal && <ExternalLink className="w-3 h-3 shrink-0" />}
      </a>

      {isExternal && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>External Link Warning</DialogTitle>
              <DialogDescription>
                You are about to leave this application and visit an external
                website. Please ensure you trust the destination.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground font-mono bg-muted p-2 rounded border border-border">
              {href}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  window.open(href, "_blank", "noopener,noreferrer")
                }
              >
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
