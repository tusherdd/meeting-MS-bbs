// Server only: next/headers cannot be imported by client code.
import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, type Locale } from "@/lib/i18n";
import { messagesFor, type Messages } from ".";

/** Server components / generateMetadata: the UI language from the `lang` cookie. */
export async function getLocale(): Promise<Locale> {
  return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

/** Server components / generateMetadata: the messages of the current UI language. */
export async function getMessages(locale?: Locale): Promise<Messages> {
  return messagesFor(locale ?? (await getLocale()));
}
