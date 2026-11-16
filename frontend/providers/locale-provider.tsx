"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { nameHelpers, type NameHelpers } from "@/lib/display-name";
import { createFormatter, type Formatter } from "@/lib/format";
import { localeCookie, type Locale } from "@/lib/i18n";
import { messagesFor, type Messages } from "@/messages";

interface LocaleContextValue {
  locale: Locale;
  t: Messages;
  format: Formatter;
  /** Saves the choice in the `lang` cookie and re-renders the page in that language. */
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * The UI language for every client component (v1.6, SPEC.md §13.14). The root layout reads the
 * `lang` cookie on the server and passes it in, so the first HTML is already in the right
 * language. Switching writes the cookie and does a soft refresh (router.refresh): client state,
 * the session and unsaved form input stay; server-rendered parts (titles) follow.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setState] = useState<Locale>(initialLocale);
  // The server is the source of truth after a refresh (e.g. the cookie changed in another tab).
  const [seen, setSeen] = useState(initialLocale);
  if (seen !== initialLocale) {
    setSeen(initialLocale);
    setState(initialLocale);
  }

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: messagesFor(locale),
      format: createFormatter(locale),
      setLocale: (next) => {
        document.cookie = localeCookie(next, window.location.protocol === "https:");
        document.documentElement.lang = next;
        setState(next);
        router.refresh();
      },
    }),
    [locale, router],
  );
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

function useLocaleContext(): LocaleContextValue {
  const value = use(LocaleContext);
  if (!value) throw new Error("LocaleProvider is missing");
  return value;
}

/** Current UI language and the switch. */
export function useLocale(): Pick<LocaleContextValue, "locale" | "setLocale"> {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}

/** UI texts of the current language. */
export function useT(): Messages {
  return useLocaleContext().t;
}

/** Number / date / time helpers of the current language (lib/format.ts). */
export function useFormat(): Formatter {
  return useLocaleContext().format;
}

/**
 * Officer / designation / wing names in the current language (v1.7, SPEC.md §13.15):
 * English value in English mode (Bangla when the English one is empty), Bangla in Bangla mode.
 */
export function useNames(): NameHelpers {
  const { locale } = useLocaleContext();
  return useMemo(() => nameHelpers(locale), [locale]);
}
