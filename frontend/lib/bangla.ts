/**
 * Bangla nukta letters (SPEC.md §13.13): the same rule as backend/src/common/utils/bangla.ts.
 * RRA and RHA precomposed (U+09DC, U+09DD); YYA as YA + NUKTA (U+09AF U+09BC), because the
 * fonts draw the other forms with a detached dot. Never apply NFC afterwards.
 * Letters are built from code points so editors and scripts cannot silently change them.
 */
const ch = (...codes: number[]): string => String.fromCharCode(...codes);

export const BANGLA_NUKTA = {
  YYA: ch(0x09df),
  YA_NUKTA: ch(0x09af, 0x09bc),
  RRA: ch(0x09dc),
  DDA_NUKTA: ch(0x09a1, 0x09bc),
  RHA: ch(0x09dd),
  DDHA_NUKTA: ch(0x09a2, 0x09bc),
} as const;

const { YYA, YA_NUKTA, RRA, DDA_NUKTA, RHA, DDHA_NUKTA } = BANGLA_NUKTA;
const NUKTA = ch(0x09bc);

export function normalizeBangla(text: string): string {
  if (!text.includes(NUKTA) && !text.includes(YYA)) return text;
  return text.split(YYA).join(YA_NUKTA).split(DDA_NUKTA).join(RRA).split(DDHA_NUKTA).join(RHA);
}

/** Keys whose values are never changed (passwords and tokens are sent exactly as typed). */
const SECRET_KEY = /password|token|secret/i;

/** normalizeBangla() on every string in plain objects / arrays, except under secret keys. */
export function normalizeBanglaDeep<T>(value: T, key = ""): T {
  if (SECRET_KEY.test(key)) return value;
  if (typeof value === "string") return normalizeBangla(value) as T;
  if (Array.isArray(value)) return value.map((v) => normalizeBanglaDeep(v, key)) as T;
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeBanglaDeep(v, k);
    return out as T;
  }
  return value;
}
