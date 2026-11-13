/**
 * Display helpers. Every number, date and time on screen goes through here:
 * Bangla digits, and always the Asia/Dhaka clock (independent of the viewer's computer).
 */
import { formatInTimeZone } from "date-fns-tz";
import { t } from "@/messages";
import { DHAKA_TZ } from "./time";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const BN_WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

/** "2026-11-09 10:30" → "২০২৬-১১-০৯ ১০:৩০". Non-digits are kept. */
export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** 1234.5 → "১,২৩৪.৫" (at most `maxFractionDigits` decimals). */
export function formatNumber(value: number, maxFractionDigits = 1): string {
  const text = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
  return toBanglaDigits(text);
}

type DateInput = string | Date;

function parts(value: DateInput) {
  const date = typeof value === "string" ? new Date(value) : value;
  // One call, then split: year, month (1-12), day, weekday (0=Sun), hour (0-23), minute.
  const [y, m, d, w, h, min] = formatInTimeZone(date, DHAKA_TZ, "yyyy M d i H mm").split(" ");
  return {
    year: Number(y),
    month: Number(m),
    day: Number(d),
    weekday: Number(w) % 7, // ISO: Monday=1 … Sunday=7 → Sunday=0
    hour: Number(h),
    minute: min,
  };
}

/** "৯ নভেম্বর ২০২৬" */
export function formatDate(value: DateInput): string {
  const p = parts(value);
  return `${toBanglaDigits(p.day)} ${BN_MONTHS[p.month - 1]} ${toBanglaDigits(p.year)}`;
}

/** "সোমবার, ৯ নভেম্বর ২০২৬" */
export function formatDateWithWeekday(value: DateInput): string {
  return `${BN_WEEKDAYS[parts(value).weekday]}, ${formatDate(value)}`;
}

/** "১০:৩০ পূর্বাহ্ণ" (12-hour clock, Dhaka time). */
export function formatTime(value: DateInput): string {
  const p = parts(value);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const suffix = p.hour < 12 ? t.format.am : t.format.pm;
  return `${toBanglaDigits(hour12)}:${toBanglaDigits(p.minute)} ${suffix}`;
}

/** "১০:০০ পূর্বাহ্ণ – ১১:৩০ পূর্বাহ্ণ" */
export function formatTimeRange(start: DateInput, end: DateInput): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "৯ নভেম্বর ২০২৬, ১০:৩০ পূর্বাহ্ণ" */
export function formatDateTime(value: DateInput): string {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** "২১.৫ ঘণ্টা" */
export function formatHours(hours: number): string {
  return t.format.hours(formatNumber(hours));
}

/** "নভেম্বর ২০২৬" */
export function formatMonthYear(value: DateInput): string {
  const p = parts(value);
  return `${BN_MONTHS[p.month - 1]} ${toBanglaDigits(p.year)}`;
}

/** "৯ নভেম্বর" */
export function formatDayMonth(value: DateInput): string {
  const p = parts(value);
  return `${toBanglaDigits(p.day)} ${BN_MONTHS[p.month - 1]}`;
}

/** "2026-11-09" → "৯ নভেম্বর" (no time-zone shift). */
export function formatPlainDayMonth(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${toBanglaDigits(d)} ${BN_MONTHS[m - 1]}`;
}

/** "2026-11" or "2026-11-09" → "নভেম্বর ২০২৬". */
export function formatPlainMonthYear(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${BN_MONTHS[m - 1]} ${toBanglaDigits(y)}`;
}

/** "2026-11" → "নভেম্বর". */
export function formatPlainMonth(date: string): string {
  return BN_MONTHS[Number(date.split("-")[1]) - 1];
}

/** "2026-11-09" → "৯". */
export function formatPlainDay(date: string): string {
  return toBanglaDigits(Number(date.split("-")[2]));
}

/** Dhaka calendar date "YYYY-MM-DD" → "৯ নভেম্বর ২০২৬" (no time-zone shift). */
export function formatPlainDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${toBanglaDigits(d)} ${BN_MONTHS[m - 1]} ${toBanglaDigits(y)}`;
}
