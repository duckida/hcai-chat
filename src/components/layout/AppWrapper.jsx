"use client";

import { ThemeProvider } from "next-themes";

export default function AppWrapper({ children }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="color-mode"
      disableTransitionOnChange={false}
    >
      {children}
    </ThemeProvider>
  );
}
