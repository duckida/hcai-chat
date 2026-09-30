"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TOOLTIP_OPEN_DELAY } from "@/lib/tooltip";

export default function AppWrapper({ children }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="color-mode"
      disableTransitionOnChange={false}
    >
      <TooltipProvider delayDuration={TOOLTIP_OPEN_DELAY}>
        {children}
      </TooltipProvider>
    </ThemeProvider>
  );
}
