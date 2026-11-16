import type { Locale } from "@/lib/i18n";
import { bn, type Messages } from "./bn";
import { en } from "./en";

/**
 * UI texts in two languages (v1.6, SPEC.md §13.14). bn.ts is the source of the type; en.ts must
 * have exactly the same keys. Components read them through useT() (client) or getMessages()
 * (server), never by importing a language file directly.
 */
export function messagesFor(locale: Locale): Messages {
  return locale === "bn" ? bn : en;
}

export { bn, en };
export type { Messages };
