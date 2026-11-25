/**
 * Is a PDF text layer usable, or must the page be OCR'd (v1.21, SPEC.md §6.12)? Pure.
 *
 * Image-only scans have no text; Bijoy / SutonnyMJ PDFs have "text" made of Latin letters that the
 * font draws as Bangla. Our notices are Bangla, so the layer counts only with enough real Bangla
 * Unicode letters and the word "সভা".
 */
export const MIN_BANGLA_LETTERS = 80;
/** Share of Bangla among all letters; Bijoy text is almost all Latin. */
export const MIN_BANGLA_SHARE = 0.4;

export function hasUsableBanglaText(text: string): boolean {
  const bangla = text.match(/[ঀ-৿]/gu)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  if (bangla < MIN_BANGLA_LETTERS) return false;
  if (bangla / (bangla + latin) < MIN_BANGLA_SHARE) return false;
  return text.includes('সভা');
}
