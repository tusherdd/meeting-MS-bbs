"use client";

import { useEffect, useState } from "react";
import { t } from "@/messages";

/** A text banner while the browser is offline, and a short note when it is back (aria-live). */
export function OfflineBanner() {
  const [state, setState] = useState<"online" | "offline" | "back">("online");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const online = () => {
      setState("back");
      timer = setTimeout(() => setState("online"), 4000);
    };
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  return (
    <div aria-live="assertive" className="fixed inset-x-0 top-0 z-50">
      {state === "offline" && (
        <p
          role="alert"
          className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900"
        >
          {t.errors.offline}
        </p>
      )}
      {state === "back" && (
        <p
          role="status"
          className="bg-brand-50 px-4 py-2 text-center text-sm font-medium text-brand-900"
        >
          {t.errors.backOnline}
        </p>
      )}
    </div>
  );
}
