import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import localFont from "next/font/local";
import { engineFromUserAgent } from "@/lib/engine";
import { AppProviders } from "@/providers/app-providers";
import { getLocale, getMessages } from "@/messages/server";
import { LocaleProvider } from "@/providers/locale-provider";
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

/**
 * Safari and all iOS browsers (WebKit, v1.5 SPEC.md §13.10): WebKit's shaper draws NikoshBAN's
 * য় (YA + NUKTA, the stored form) with the dot detached, and the opposite form is broken in
 * Chromium, so the text cannot fix it. For WebKit only, Bangla comes from Kohinoor Bangla (built
 * into Apple systems, `local()` face in globals.css) and then this bundled Noto Sans Bengali
 * (SIL OFL 1.1, LICENSE-NotoSansBengali.txt). Same unicode-range: Latin stays Times New Roman.
 * preload: false, so other browsers never download it (they never use it).
 */
const notoBengali = localFont({
  src: "./fonts/NotoSansBengali.ttf",
  weight: "100 900",
  style: "normal",
  variable: "--font-noto-bengali",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0980-09FF, U+0964-0965, U+200C-200D" }],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return {
    title: { default: t.app.name, template: `%s — ${t.app.name}` },
    description: t.app.org,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#006a4e",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render per request: Next.js puts the CSP nonce from proxy.ts on its scripts (no static pages).
  await connection();
  // Server-side engine detection: the right font is in the first HTML, no flash, no script.
  const engine = engineFromUserAgent((await headers()).get("user-agent"));
  // UI language from the `lang` cookie (v1.6): rendered on the server, so no flash on load.
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      data-engine={engine}
      className={`${nikosh.variable} ${notoBengali.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">
        <LocaleProvider initialLocale={locale}>
          <AppProviders>{children}</AppProviders>
        </LocaleProvider>
      </body>
    </html>
  );
}
