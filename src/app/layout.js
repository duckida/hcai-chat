import { Inter } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import AppWrapper from "@/components/layout/AppWrapper";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Hack Club AI Chat",
  description: "A modern web-based chat UI for Hack Club AI",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${inter.className} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script async src="https://scripts.simpleanalyticscdn.com/latest.js" />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: FOUC prevention for dark mode
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("color-mode");if(!t||t==="system"){var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}else{document.documentElement.classList.toggle("dark",t==="dark")}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
