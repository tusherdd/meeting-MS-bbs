/**
 * Bangla calendar dates for the meeting notice (v1.10, SPEC.md §6.8).
 *
 * Bangladesh's revised Bangabda (2019 reform):
 * - 1 Boishakh = 14 April (Gregorian), so the Bangla year = Gregorian year − 593 from 14 April on,
 *   and − 594 before it;
 * - Boishakh … Ashwin (months 1–6) have 31 days;
 * - Kartik, Agrahayan, Poush, Magh and Chaitra have 30 days;
 * - Falgun has 29 days, or 30 when it falls in a Gregorian leap year (February 29 inside it).
 *
 * Every date is taken on the Asia/Dhaka calendar. Output uses Bangla digits; month names are
 * passed through normalizeBangla() so nukta letters are always in the stored form (§13.13).
 */
import { DateTime } from 'luxon';
import { normalizeBangla } from './bangla';
import { toBanglaDigits } from './digits';
import { DHAKA_TZ } from './time';

export const BANGLA_MONTHS: readonly string[] = [
  'বৈশাখ',
  'জ্যৈষ্ঠ',
  'আষাঢ়',
  'শ্রাবণ',
  'ভাদ্র',
  'আশ্বিন',
  'কার্তিক',
  'অগ্রহায়ণ',
  'পৌষ',
  'মাঘ',
  'ফাল্গুন',
  'চৈত্র',
].map(normalizeBangla);

export const GREGORIAN_MONTHS_BN: readonly string[] = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
].map(normalizeBangla);

export interface BanglaDate {
  /** 1-based day of the Bangla month. */
  day: number;
  /** 0-based month index into BANGLA_MONTHS (0 = Boishakh). */
  monthIndex: number;
  year: number;
}

function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Month lengths of the Bangla year that starts on 14 April of `startYear`. */
export function banglaMonthLengths(startYear: number): number[] {
  // Falgun (mid-February to mid-March) lies in the next Gregorian year.
  const falgun = isGregorianLeapYear(startYear + 1) ? 30 : 29;
  return [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, falgun, 30];
}

/** The Dhaka calendar day of `date`, as a UTC day number (days since 1970-01-01). */
function dhakaDay(date: Date): { y: number; m: number; d: number } {
  const dt = DateTime.fromJSDate(date, { zone: DHAKA_TZ });
  return { y: dt.year, m: dt.month, d: dt.day };
}

const DAY_MS = 86_400_000;

export function toBanglaDate(date: Date): BanglaDate {
  const { y, m, d } = dhakaDay(date);
  const startYear = m > 4 || (m === 4 && d >= 14) ? y : y - 1;
  let offset = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(startYear, 3, 14)) / DAY_MS,
  );
  const lengths = banglaMonthLengths(startYear);
  let monthIndex = 0;
  while (offset >= lengths[monthIndex]) {
    offset -= lengths[monthIndex];
    monthIndex++;
  }
  return { day: offset + 1, monthIndex, year: startYear - 593 };
}

/** "২৪ কার্তিক, ১৪৩৩" */
export function formatBanglaCalendarDate(date: Date): string {
  const b = toBanglaDate(date);
  return `${toBanglaDigits(b.day)} ${BANGLA_MONTHS[b.monthIndex]}, ${toBanglaDigits(b.year)}`;
}

/** "১৭ নভেম্বর, ২০২৬" (Gregorian, Asia/Dhaka, Bangla digits and month names). */
export function formatGregorianDateBn(date: Date): string {
  const { y, m, d } = dhakaDay(date);
  return `${toBanglaDigits(d)} ${GREGORIAN_MONTHS_BN[m - 1]}, ${toBanglaDigits(y)}`;
}
