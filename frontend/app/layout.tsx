import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import localFont from "next/font/local";
import { AppProviders } from "@/providers/app-providers";
import { t } from "@/messages";
import "./globals.css";

/**
 * Fonts (owner decisions 2026-11-14 and 2026-11-15, SPEC.md §13.10): Bangla in NikoshBAN, English in
 * Times New Roman.
 * - NikoshBAN is the Bangladesh government's standard Bangla font (same Bangla letters as Nikosh;
 *   it only draws the ASCII digits 0–9 as Bangla digits), self-hosted from
 *   app/fonts/NikoshBAN.ttf (no font request leaves this origin; CSP font-src 'self').
 * - unicode-range limits it to Bangla characters (the block includes ৳), danda / double danda and
 *   the zero-width (non-)joiner. Latin letters and digits are NOT taken from NikoshBAN
 *   (so typed 0–9 never look like Bangla digits): they come from
 *   the next fonts in --font-sans (Times New Roman from the user's computer; it is not bundled).
 * - NikoshBAN has one weight. It is declared as 400, so the browser synthesises bold for headings.
 * - NikoshBAN draws smaller than other fonts at the same size: size-adjust enlarges only its glyphs.
 *   Together with the 17 px base size in globals.css, Bangla and English words (many labels are
 *   English since 2026-11-15) look the same size side by side.
 */
const nikosh = localFont({
  src: "./fonts/NikoshBAN.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-nikosh",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "unicode-range", value: "U+0980-09FF, U+0964-0965, U+200C-200D" },
    { prop: "size-adjust", value: "127%" },
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
