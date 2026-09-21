"use client";

import { Sparkles, User } from "lucide-react";

/**
 * Shared message row: avatar + body column at the fixed reading width.
 * Consolidates the repeated `max-w-[700px] mx-auto px-4 sm:px-6` grid so
 * the message width and gutters can be tuned in one place.
 */
export default function MessageRow({ variant = "assistant", children }) {
  const isAssistant = variant === "assistant";

  return (
    <div className="msg-row max-w-[700px] mx-auto px-4 sm:px-6 py-5 sm:py-8 flex gap-3 sm:gap-5 md:gap-7">
      <div
        className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl shrink-0 flex items-center justify-center ${
          isAssistant
            ? "bg-primary text-primary-foreground shadow-lg"
            : "bg-muted text-muted-foreground border border-border"
        }`}
      >
        {isAssistant ? (
          <Sparkles className="h-4.5 w-4.5" />
        ) : (
          <User className="h-4.5 w-4.5" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-4 overflow-hidden pt-1">
        {children}
      </div>
    </div>
  );
}
