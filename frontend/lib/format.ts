/**
 * Display helpers (v1.6: per UI language, SPEC.md §13.11/§13.14). Every system-generated number,
 * date and time on screen goes through here, always on the Asia/Dhaka clock:
 * - bn: Bangla digits and Bangla month / weekday names;
 * - en: Latin digits and English month / weekday names.
 * User-entered text is never passed through these helpers (shown exactly as stored).
 *
 * Components use `useFormat()` (providers/locale-provider.tsx); other code calls
 * `createFormatter(locale)`.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { Locale } from "./i18n";
import { messagesFor } from "@/messages";
import { DHAKA_TZ } from "./time";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

const MONTHS: Record<Locale, string[]> = {
  bn: [
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
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

const WEEKDAYS: Record<Locale, string[]> = {
  bn: ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** "2026-11-09 10:30" → "২০২৬-১১-০৯ ১০:৩০". Non-digits are kept. */
export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
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

/** All display helpers for one UI language. */
export function createFormatter(locale: Locale) {
  const months = MONTHS[locale];
  const weekdays = WEEKDAYS[locale];
  const m = messagesFor(locale);
  /** System digits: Bangla in bn, Latin in en. */
  const digits = (value: string | number) =>
    locale === "bn" ? toBanglaDigits(value) : String(value);

  /** 1234.5 → "১,২৩৪.৫" / "1,234.5" (at most `maxFractionDigits` decimals). */
  function formatNumber(value: number, maxFractionDigits = 1): string {
    return digits(
      new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(value),
    );
  }

  /** "৯ নভেম্বর ২০২৬" / "9 November 2026" */
  function formatDate(value: DateInput): string {
    const p = parts(value);
    return `${digits(p.day)} ${months[p.month - 1]} ${digits(p.year)}`;
  }

  /** "সোমবার, ৯ নভেম্বর ২০২৬" / "Monday, 9 November 2026" */
  function formatDateWithWeekday(value: DateInput): string {
    return `${weekdays[parts(value).weekday]}, ${formatDate(value)}`;
  }

  /** "১০:৩০ পূর্বাহ্ণ" / "10:30 AM" (12-hour clock, Dhaka time). */
  function formatTime(value: DateInput): string {
    const p = parts(value);
    const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
    const suffix = p.hour < 12 ? m.format.am : m.format.pm;
    return `${digits(hour12)}:${digits(p.minute)} ${suffix}`;
  }

  /** v1.15 office report: "০৩/১১/২০২৬" / "03/11/2026" (dd/mm/yyyy, Dhaka date). */
  function formatNumericDate(value: DateInput): string {
    const p = parts(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return digits(`${pad(p.day)}/${pad(p.month)}/${p.year}`);
  }

  /** v1.15 office report: "১৪:৩০" / "14:30" (24-hour clock, Dhaka time). */
  function formatClock(value: DateInput): string {
    const p = parts(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return digits(`${pad(p.hour)}:${p.minute}`);
  }

  /** "10:00 AM – 11:30 AM" */
  function formatTimeRange(start: DateInput, end: DateInput): string {
    return `${formatTime(start)} – ${formatTime(end)}`;
  }

  /** "9 November 2026, 10:30 AM" */
  function formatDateTime(value: DateInput): string {
    return `${formatDate(value)}, ${formatTime(value)}`;
  }

  /** Hours as a number with the language's unit text (messages: format.hours). */
  function formatHours(hours: number): string {
    return m.format.hours(formatNumber(hours));
  }

  /** "নভেম্বর ২০২৬" / "November 2026" */
  function formatMonthYear(value: DateInput): string {
    const p = parts(value);
    return `${months[p.month - 1]} ${digits(p.year)}`;
  }

  /** "৯ নভেম্বর" / "9 November" */
  function formatDayMonth(value: DateInput): string {
    const p = parts(value);
    return `${digits(p.day)} ${months[p.month - 1]}`;
  }

  /** "2026-11-09" → "9 November" (no time-zone shift). */
  function formatPlainDayMonth(date: string): string {
    const [, mo, d] = date.split("-").map(Number);
    return `${digits(d)} ${months[mo - 1]}`;
  }

  /** "2026-11" or "2026-11-09" → "November 2026". */
  function formatPlainMonthYear(date: string): string {
    const [y, mo] = date.split("-").map(Number);
    return `${months[mo - 1]} ${digits(y)}`;
  }

  /** "2026-11" → "November". */
  function formatPlainMonth(date: string): string {
    return months[Number(date.split("-")[1]) - 1];
  }

  /** "2026-11-09" → "9". */
  function formatPlainDay(date: string): string {
    return digits(Number(date.split("-")[2]));
  }

  /** Dhaka calendar date "YYYY-MM-DD" → "9 November 2026" (no time-zone shift). */
  function formatPlainDate(date: string): string {
    const [y, mo, d] = date.split("-").map(Number);
    return `${digits(d)} ${months[mo - 1]} ${digits(y)}`;
  }

  /** v1.11: file sizes, "৮৫০ KB" / "1.2 MB" (KB below 1 MB, at most one decimal). */
  function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)), 0)} KB`;
    return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
  }

  return {
    locale,
    digits,
    formatNumber,
    formatFileSize,
    formatDate,
    formatDateWithWeekday,
    formatTime,
    formatTimeRange,
    formatDateTime,
    formatNumericDate,
    formatClock,
    formatHours,
    formatMonthYear,
    formatDayMonth,
    formatPlainDayMonth,
    formatPlainMonthYear,
    formatPlainMonth,
    formatPlainDay,
    formatPlainDate,
  };
}

export type Formatter = ReturnType<typeof createFormatter>;
