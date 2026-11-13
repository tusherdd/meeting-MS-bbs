"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { t } from "@/messages";

/** 500 page: an unexpected error while rendering (the rest of the app keeps working). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only the message: never data from the page.
    console.error("Page error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-red-700">৫০০</p>
      <h1 className="text-xl font-semibold">{t.errors.serverTitle}</h1>
      <p className="max-w-md text-slate-600">{t.errors.serverBody}</p>
      {error.digest && (
        <p className="text-xs text-slate-600">
          {t.errors.errorCode}: <span className="font-mono select-all">{error.digest}</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>{t.common.retry}</Button>
        <LinkButton href="/dashboard" variant="secondary">
          {t.common.goToDashboard}
        </LinkButton>
      </div>
    </main>
  );
}
