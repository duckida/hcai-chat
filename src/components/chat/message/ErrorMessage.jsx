"use client";

import { AlertTriangle } from "lucide-react";
import MessageRow from "./MessageRow";

export default function ErrorMessage({ error }) {
  if (!error) return null;

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <MessageRow variant="user">
        <div className="flex-1 min-w-0 space-y-4 overflow-hidden pt-1">
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="font-semibold text-red-700 dark:text-red-400 text-[15.5px]">
                {error.title || "Error"}
              </span>
            </div>
            {error.details && (
              <p className="text-[14px] text-red-600/80 dark:text-red-400/80 leading-relaxed">
                {error.details}
              </p>
            )}
          </div>
        </div>
      </MessageRow>
    </div>
  );
}
