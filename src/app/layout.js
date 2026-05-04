import { Inter } from "next/font/google";
import "./globals.css";
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
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
