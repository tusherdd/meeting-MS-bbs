/**
 * UI language (v1.6, SPEC.md §13.14): English (default) or Bangla, remembered only in this
 * browser in the `lang` cookie (never in the account). Shared by server and client code.
 */
export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";
/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** A missing or invalid value means English. */
export function parseLocale(value: string | null | undefined): Locale {
  return value === "bn" || value === "en" ? value : DEFAULT_LOCALE;
}

/** The other language (what the switch button offers). */
export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "bn" : "en";
}

/** `lang=bn; Path=/; Max-Age=31536000; SameSite=Lax[; Secure]` — Secure on https (production). */
export function localeCookie(locale: Locale, secure: boolean): string {
  return [
    `${LOCALE_COOKIE}=${locale}`,
    "Path=/",
    `Max-Age=${LOCALE_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** The locale from a Cookie header / document.cookie string. */
export function localeFromCookieString(cookies: string | null | undefined): Locale {
  const match = (cookies ?? "").match(/(?:^|;\s*)lang=([^;]*)/);
  return parseLocale(match?.[1]);
}

/** Client only: the current locale from document.cookie (English on the server). */
export function currentLocale(): Locale {
  return typeof document === "undefined" ? DEFAULT_LOCALE : localeFromCookieString(document.cookie);
}
