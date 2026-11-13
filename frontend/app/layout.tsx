import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Hind_Siliguri } from "next/font/google";
import { AppProviders } from "@/providers/app-providers";
import { t } from "@/messages";
import "./globals.css";

const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind-siliguri",
  display: "swap",
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
    <html lang="bn" className={`${hindSiliguri.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
