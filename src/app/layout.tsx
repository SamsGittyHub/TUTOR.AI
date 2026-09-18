import { LanguageProvider } from "@/lib/language";

import type { Metadata, Viewport } from "next";
import { Nunito, Kalam, Space_Mono } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "katex/dist/katex.min.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

const kalam = Kalam({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-kalam",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TUTOR AI — the tutor that writes on the board",
  description:
    "Upload your notes, slides, or lecture recordings and get a 1:1 lesson taught step by step on a live whiteboard — out loud, if you want. Free while in beta.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f4f2ec" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${kalam.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-ink text-fg antialiased">
        {/* Applies the stored / OS theme before first paint — no flash. It
            also flips the browser UI (color-scheme) along with it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
