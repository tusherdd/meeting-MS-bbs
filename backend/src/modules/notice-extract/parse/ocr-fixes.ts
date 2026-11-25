import { normalizeBangla } from '../../../common/utils/bangla';

/**
 * Small dictionary of common OCR misreads in our notices (v1.21, SPEC.md §6.12). Whole-word
 * replacements only (a fix never changes part of a longer word). Keys and values are normalized
 * with normalizeBangla() so they compare with the normalized OCR text (SPEC.md §13.13).
 *
 * Add an entry only for a misread seen in a real notice, never for a guess.
 */
const RAW_FIXES: ReadonlyArray<readonly [string, string]> = [
  ['আগারগীও', 'আগারগাঁও'],
  ['আগারগাও', 'আগারগাঁও'],
  ['মহদয়', 'মহোদয়'],
  ['মহদয়ের', 'মহোদয়ের'],
  ['মহোদযের', 'মহোদয়ের'],
  ['যেগাসচিব', 'যুগ্মসচিব'],
  ['যুগ্নসচিব', 'যুগ্মসচিব'],
  ['যুগ্মসঢিব', 'যুগ্মসচিব'],
  ['এনালিন্ট', 'এনালিস্ট'],
  ['এনালিষ্ট', 'এনালিস্ট'],
  ['পরিসংখ্যাল', 'পরিসংখ্যান'],
  ['ব্যুবো', 'ব্যুরো'],
  ['বিবিএন', 'বিবিএস'],
  ['আলোচ্যসুচি', 'আলোচ্যসূচি'],
  ['আলোচ্যসূচী', 'আলোচ্যসূচি'],
  ['সভাপতিঃ', 'সভাপতি:'],
];

export const OCR_FIXES: ReadonlyArray<readonly [string, string]> =
  RAW_FIXES.map(
    ([from, to]) => [normalizeBangla(from), normalizeBangla(to)] as const,
  ).filter(([from, to]) => from !== to);

/** Letters, digits and Bangla signs: a fix must not touch one of them on either side. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}ঀ-৿]/u;

function replaceWord(text: string, from: string, to: string): string {
  let out = '';
  let i = 0;
  for (let at = text.indexOf(from); at >= 0; at = text.indexOf(from, i)) {
    const before = at > 0 ? text[at - 1] : '';
    const after = text[at + from.length] ?? '';
    const whole = !WORD_CHAR.test(before) && !WORD_CHAR.test(after);
    out += text.slice(i, at) + (whole ? to : from);
    i = at + from.length;
  }
  return out + text.slice(i);
}

/** normalizeBangla() + the dictionary. Idempotent. */
export function applyOcrFixes(text: string): string {
  let out = normalizeBangla(text);
  for (const [from, to] of OCR_FIXES) {
    if (out.includes(from)) out = replaceWord(out, from, to);
  }
  return out;
}
