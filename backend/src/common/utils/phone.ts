import { toAsciiDigits } from './digits';

/** Bangladesh mobile number in national format: 01 + operator digit (3–9) + 8 digits. */
export const BD_MOBILE_PATTERN = /^01[3-9]\d{8}$/;

/**
 * Normalises a Bangladesh mobile number to 01XXXXXXXXX (SPEC.md §4 phone normalizer).
 * Accepts Bangla or English digits, spaces, dashes, dots, brackets and the country code
 * (+880 / 880 / 00880). Returns the cleaned string even if it is not a valid number —
 * validation (BD_MOBILE_PATTERN) decides that, so the user gets a clear message.
 */
export function normalizeBdMobile(value: string): string {
  let digits = toAsciiDigits(value).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00880')) digits = digits.slice(5);
  else if (digits.startsWith('880')) digits = digits.slice(3);
  // After a country code the leading 0 is often dropped: 8801712… → 1712… → 01712…
  if (/^1[3-9]\d{8}$/.test(digits)) digits = `0${digits}`;
  return digits;
}
