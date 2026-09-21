"use client";

import { Sparkles } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] text-center opacity-40 select-none px-4 sm:px-6">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[2rem] bg-foreground text-background flex items-center justify-center shadow-2xl mb-6 sm:mb-8 transform hover:scale-110 transition-transform duration-500">
        <Sparkles className="h-7 w-7 sm:h-8 sm:w-8" />
      </div>
      <h1 className="text-xl sm:text-2xl font-[800] tracking-[-0.03em] text-foreground mb-2 uppercase">
        Hack Club AI
      </h1>
      <p className="text-[12px] sm:text-[13px] font-medium text-muted-foreground max-w-[260px] sm:max-w-[280px] leading-relaxed">
        What do you need help with?
      </p>
    </div>
  );
}
