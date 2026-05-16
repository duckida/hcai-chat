"use client";

import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
        className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300 hover:decoration-blue-600 transition-colors inline-flex items-center gap-1"
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
            <div className="py-4 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-slate-500 font-mono bg-slate-50 p-2 rounded border">
              {href}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
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
