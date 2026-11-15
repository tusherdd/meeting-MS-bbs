/**
 * Bangla nukta letters (SPEC.md §13.13). Every Bangla text the app stores, sends or shows uses
 * the form that NikoshBAN / Nikosh draw correctly in browsers (Chrome, Firefox, PDF via Chromium):
 *
 * - RRA and RHA precomposed: U+09DC and U+09DD. The decomposed DDA/DDHA + NUKTA
 *   (U+09A1/U+09A2 + U+09BC) show the nukta dot detached.
 * - YYA decomposed: YA + NUKTA (U+09AF U+09BC). The text shaper joins this pair into the font's
 *   YYA glyph; the precomposed U+09DF is split again by the shaper and its dot is drawn detached.
 *
 * Do NOT apply NFC (or NFD) afterwards: NFC decomposes U+09DC/U+09DD (composition exclusions).
 * The function is idempotent and changes nothing else.
 *
 * The letters are built from code points on purpose: editors, formatters and copy/paste may
 * silently change literal nukta letters, so this file never contains them.
 */
const ch = (...codes: number[]): string => String.fromCharCode(...codes);

export const BANGLA_NUKTA = {
  /** U+09DF precomposed YYA: drawn broken, never stored. */
  YYA: ch(0x09df),
  /** YA + NUKTA: the stored form of YYA. */
  YA_NUKTA: ch(0x09af, 0x09bc),
  /** U+09DC precomposed RRA: the stored form. */
  RRA: ch(0x09dc),
  /** DDA + NUKTA: drawn broken, never stored. */
  DDA_NUKTA: ch(0x09a1, 0x09bc),
  /** U+09DD precomposed RHA: the stored form. */
  RHA: ch(0x09dd),
  /** DDHA + NUKTA: drawn broken, never stored. */
  DDHA_NUKTA: ch(0x09a2, 0x09bc),
} as const;

const { YYA, YA_NUKTA, RRA, DDA_NUKTA, RHA, DDHA_NUKTA } = BANGLA_NUKTA;
const NUKTA = ch(0x09bc);

export function normalizeBangla(text: string): string {
  if (!text.includes(NUKTA) && !text.includes(YYA)) return text; // fast path
  return text
    .split(YYA)
    .join(YA_NUKTA)
    .split(DDA_NUKTA)
    .join(RRA)
    .split(DDHA_NUKTA)
    .join(RHA);
}

/** True when the text contains one of the forms normalizeBangla() replaces. */
export function hasUnnormalizedBangla(text: string): boolean {
  return (
    text.includes(YYA) || text.includes(DDA_NUKTA) || text.includes(DDHA_NUKTA)
  );
}

/** Keys whose values are never changed (secrets must stay byte-for-byte as typed). */
const SECRET_KEY = /password|token|secret/i;

/**
 * Applies normalizeBangla() to every string inside plain objects and arrays (request bodies and
 * query strings), except values under keys that look like secrets. Other values are returned as is.
 */
export function normalizeBanglaDeep(value: unknown, key = ''): unknown {
  if (SECRET_KEY.test(key)) return value;
  if (typeof value === 'string') return normalizeBangla(value);
  if (Array.isArray(value))
    return value.map((v) => normalizeBanglaDeep(v, key));
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return value; // Buffer, Date, file, ...
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = normalizeBanglaDeep(v, k);
    return out;
  }
  return value;
}
