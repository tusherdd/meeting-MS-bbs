import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import localFont from "next/font/local";
import { AppProviders } from "@/providers/app-providers";
import { t } from "@/messages";
import "./globals.css";

/**
 * Fonts (owner decisions 2026-11-14, SPEC.md §13.10): Bangla in Nikosh, English in Times New Roman.
 * - Nikosh is the Bangladesh government's standard Bangla font, self-hosted from
 *   app/fonts/Nikosh.ttf (no font request leaves this origin; CSP font-src 'self').
 * - unicode-range limits it to Bangla characters (the block includes ৳), danda / double danda and
 *   the zero-width (non-)joiner. Latin letters and digits are NOT taken from Nikosh: they come from
 *   the next fonts in --font-sans (Times New Roman from the user's computer; it is not bundled).
 * - Nikosh has one weight. It is declared as 400, so the browser synthesises bold for headings.
 * - Nikosh draws smaller than other fonts at the same size: size-adjust enlarges only its glyphs,
 *   so English text and all rem-based spacing stay as they are.
 */
const nikosh = localFont({
  src: "./fonts/Nikosh.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-nikosh",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "unicode-range", value: "U+0980-09FF, U+0964-0965, U+200C-200D" },
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
