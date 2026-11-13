/**
 * Phone helpers, the same rules as the backend (common/utils/phone.ts, dto/transforms.ts):
 * Bangla or English digits, spaces, dashes and +880 are accepted; mobiles are stored as 01XXXXXXXXX.
 */
export const BD_MOBILE_PATTERN = /^01[3-9]\d{8}$/;
export const PHONE_PATTERN = /^\+?[0-9][0-9 -]{3,}[0-9]$/;

/** "০১৭১২" → "01712" (other characters are kept). */
export function toEnglishDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

/** "+৮৮০ ১৭১২-৩৪৫৬৭৮" → "01712345678". Returns the cleaned text even when it is not valid. */
export function normalizeMobile(value: string): string {
  let digits = toEnglishDigits(value).replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00880")) digits = digits.slice(5);
  else if (digits.startsWith("880")) digits = digits.slice(3);
  if (/^1[3-9]\d{8}$/.test(digits)) digits = `0${digits}`;
  return digits;
}

/** Office phone / fax: English digits, single spaces. */
export function normalizePhone(value: string): string {
  return toEnglishDigits(value).trim().replace(/\s+/g, " ");
}
