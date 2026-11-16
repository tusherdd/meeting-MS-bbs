import { toAsciiDigits } from '../utils/digits';
import {
  MESSAGE_CATALOG,
  PARAM_TRANSLATIONS,
  type MessageCode,
} from './message-catalog';

/** Languages of API messages (v1.6, SPEC.md §13.14). */
export type ApiLanguage = 'bn' | 'en';

/**
 * Picks the answer language from an Accept-Language header. The frontend sends exactly
 * "en" or "bn"; for robustness the first tag decides ("en-US,en;q=0.9" → en). A missing or
 * unknown header means Bangla, so older clients see what they always saw.
 */
export function resolveApiLanguage(
  header: string | string[] | undefined,
): ApiLanguage {
  const raw = Array.isArray(header) ? header[0] : header;
  const first = (raw ?? '').split(',')[0].trim().toLowerCase();
  return first === 'en' || first.startsWith('en-') ? 'en' : 'bn';
}

/**
 * The answer language of a request: `X-Lang` (en|bn) wins, then Accept-Language. The frontend
 * sends both; X-Lang exists because WebKit (Safari) replaces a script's Accept-Language with the
 * browser's own language, so the UI choice would otherwise be lost there.
 */
export function requestLanguage(
  headers: Record<string, string | string[] | undefined>,
): ApiLanguage {
  const raw = headers['x-lang'];
  const explicit = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (explicit === 'en' || explicit === 'bn') return explicit;
  return resolveApiLanguage(headers['accept-language']);
}

interface CompiledTemplate {
  code: MessageCode;
  names: string[];
  pattern: RegExp;
}

const PLACEHOLDER = /\{([A-Za-z_]+)\}/g;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EXACT = new Map<string, MessageCode>();
const TEMPLATES: CompiledTemplate[] = [];

for (const code of Object.keys(MESSAGE_CATALOG) as MessageCode[]) {
  const bn: string = MESSAGE_CATALOG[code].bn;
  const names = [...bn.matchAll(PLACEHOLDER)].map((m) => m[1]);
  if (names.length === 0) {
    EXACT.set(bn, code);
    continue;
  }
  const source = bn
    .split(PLACEHOLDER)
    // split() with a capture group alternates literal text and placeholder names
    .map((part, i) => (i % 2 === 0 ? escapeRegExp(part) : '(.+?)'))
    .join('');
  TEMPLATES.push({ code, names, pattern: new RegExp(`^${source}$`, 's') });
}

/** Finds the catalog entry of a Bangla message, with its parameter values. */
export function lookupMessage(
  text: string,
): { code: MessageCode; params: Record<string, string> } | null {
  const exact = EXACT.get(text);
  if (exact) return { code: exact, params: {} };
  for (const t of TEMPLATES) {
    const match = t.pattern.exec(text);
    if (!match) continue;
    const params: Record<string, string> = {};
    t.names.forEach((name, i) => (params[name] = match[i + 1]));
    return { code: t.code, params };
  }
  return null;
}

function fill(
  template: string,
  params: Record<string, string>,
  lang: ApiLanguage,
): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const value = params[name] ?? '';
    if (lang === 'bn') return value;
    // English: known Bangla labels get their English form and Bangla digits become Latin.
    // Emails and names typed by users are copied as they are.
    const known = PARAM_TRANSLATIONS[value];
    return known ?? (/^[\d০-৯.,]+$/.test(value) ? toAsciiDigits(value) : value);
  });
}

/** The text of a catalog entry in one language. */
export function messageText(
  code: MessageCode,
  lang: ApiLanguage,
  params: Record<string, string> = {},
): string {
  const entry = MESSAGE_CATALOG[code];
  return fill(lang === 'bn' ? entry.bn : entry.en, params, lang);
}

/**
 * One API message in the requested language, with its code. Text that is not in the catalog
 * (e.g. a development-only server error) is returned unchanged and without a code.
 */
export function translateMessage(
  text: string,
  lang: ApiLanguage,
): { message: string; code?: MessageCode } {
  const found = lookupMessage(text);
  if (!found) return { message: text };
  if (lang === 'bn') return { message: text, code: found.code };
  return {
    message: messageText(found.code, 'en', found.params),
    code: found.code,
  };
}
