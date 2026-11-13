import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import localFont from "next/font/local";
import { AppProviders } from "@/providers/app-providers";
import { t } from "@/messages";
import "./globals.css";

/**
 * Nikosh: the Bangladesh government's standard Bangla font (owner decision 2026-11-14, SPEC.md §13.5).
 * Self-hosted from app/fonts/Nikosh.ttf, so no font request ever leaves this origin (CSP font-src 'self').
 * - Only Bangla characters use it (unicode-range); Latin text (emails, English names) falls to the
 *   system sans-serif in --font-sans.
 * - Nikosh has one weight. It is declared as 400, so the browser synthesises bold for headings.
 * - Nikosh draws smaller than other Bangla fonts at the same size: size-adjust enlarges only its
 *   glyphs, so Latin text and all rem-based spacing stay as they are.
 */
const nikosh = localFont({
  src: "./fonts/Nikosh.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-nikosh",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    // Bengali block, danda / double danda, zero-width (non-)joiner, dotted circle.
    { prop: "unicode-range", value: "U+0980-09FF, U+0964-0965, U+200C-200D, U+25CC" },
    { prop: "size-adjust", value: "135%" },
  ],
});

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s — ${t.app.name}` },
  description: t.app.org,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#006a4e",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render per request: Next.js puts the CSP nonce from proxy.ts on its scripts (no static pages).
  await connection();
  return (
    <html lang="bn" className={`${nikosh.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
