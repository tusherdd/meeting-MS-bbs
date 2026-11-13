"use client";

import { t } from "@/messages";
import "./globals.css";

/** Last resort when even the root layout fails: its own <html>, no providers. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="bn">
      <body className="bg-slate-50 font-sans text-slate-900">
        <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-5xl font-bold text-red-700">৫০০</p>
          <h1 className="text-xl font-semibold">{t.errors.serverTitle}</h1>
          <p className="max-w-md text-slate-600">{t.errors.serverBody}</p>
          {error.digest && (
            <p className="text-xs text-slate-600">
              {t.errors.errorCode}: <span className="font-mono">{error.digest}</span>
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="h-10 rounded-lg bg-brand-700 px-4 font-medium text-white hover:bg-brand-800"
            >
              {t.common.retry}
            </button>
            {/* A full reload: the app's router may be broken here. */}
            <a
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 font-medium"
            >
              {t.common.goToDashboard}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
