"use client";

import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppWrapper({ children }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
