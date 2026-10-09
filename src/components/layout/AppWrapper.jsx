"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { useSettings } from "@/stores/settings";

function GoogleFontLoader() {
  const theme = useSettings((state) => state.theme);
  const googleFont = useSettings((state) => state.googleFont);

  useEffect(() => {
    if (theme !== "custom") return;

    let fontStylesheet = document.getElementById("hcai-custom-google-font");
    if (!fontStylesheet) {
      fontStylesheet = document.createElement("link");
      fontStylesheet.id = "hcai-custom-google-font";
      fontStylesheet.rel = "stylesheet";
      document.head.append(fontStylesheet);
    }
    const family = encodeURIComponent(googleFont).replaceAll("%20", "+");
    fontStylesheet.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700;800&display=swap`;
  }, [theme, googleFont]);

  return null;
}

export default function AppWrapper({ children }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="color-mode"
      disableTransitionOnChange={false}
    >
      <GoogleFontLoader />
      {children}
    </ThemeProvider>
  );
}
