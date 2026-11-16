"use client";

import clsx from "clsx";
import { otherLocale } from "@/lib/i18n";
import { messagesFor } from "@/messages";
import { useLocale, useT } from "@/providers/locale-provider";

/**
 * Text-only language button (v1.6, SPEC.md §13.14; no icon): shows the OTHER language in its own
 * script ("বাংলা" while the UI is English, "English" while it is Bangla). The choice is kept in
 * the `lang` cookie of this browser only; the page re-renders without losing form input.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const target = otherLocale(locale);
  return (
    <button
      type="button"
      onClick={() => setLocale(target)}
      aria-label={t.language.switchAria}
      data-testid="language-switch"
      className={clsx(
        "h-10 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50",
        className,
      )}
    >
      <span lang={target}>{messagesFor(target).language.name}</span>
    </button>
  );
}
