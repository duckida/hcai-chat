"use client";

/**
 * Shared message row: the body column at the fixed reading width.
 * Consolidates the repeated `max-w-[700px] mx-auto px-4 sm:px-6` grid so
 * the message width and gutters can be tuned in one place. No avatars —
 * user rows right-align their bubble, assistant rows stay left-aligned.
 */
export default function MessageRow({ variant = "assistant", children }) {
  const isAssistant = variant === "assistant";

  return (
    <div className="msg-row max-w-[700px] mx-auto px-4 sm:px-6 py-5 sm:py-8">
      <div
        className={`min-w-0 space-y-4 overflow-hidden ${
          isAssistant ? "" : "flex flex-col items-end"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
