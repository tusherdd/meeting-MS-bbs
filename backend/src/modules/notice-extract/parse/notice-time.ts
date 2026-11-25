import { DateTime } from 'luxon';
import { normalizeBangla } from '../../../common/utils/bangla';
import { toAsciiDigits } from '../../../common/utils/digits';
import { DHAKA_TZ } from '../../../common/utils/time';

/**
 * Date and time of a notice line like "১০ নভেম্বর, ২০২৬; বেলা : ১২.০০ ঘটিকা" (v1.21, SPEC.md §6.12).
 * Pure: no clock, no database. Never guesses a date; a time without a day-part word is read as
 * written, except 1–7 o'clock (office hours: afternoon), which is reported as an assumption.
 */

/** Default meeting duration of the form (v1.18). */
export const DEFAULT_DURATION_MINUTES = 45;

export type DayPart =
  'morning' | 'noon' | 'daytime' | 'afternoon' | 'evening' | 'night';

/** Day-part words. "বেলা" = daytime (বেলা ১২.০০ = 12:00, বেলা ২.০০ = 14:00, বেলা ১১.০০ = 11:00). */
const DAY_PART_WORDS: ReadonlyArray<readonly [string, DayPart]> = [
  ['সকাল', 'morning'],
  ['পূর্বাহ্ন', 'morning'],
  ['দুপুর', 'noon'],
  ['বেলা', 'daytime'],
  ['বিকাল', 'afternoon'],
  ['বিকেল', 'afternoon'],
  ['অপরাহ্ন', 'afternoon'],
  ['সন্ধ্যা', 'evening'],
  ['রাত', 'night'],
];

const MONTHS: ReadonlyArray<readonly [string, number]> = [
  ['জানুয়ারি', 1],
  ['জানুয়ারী', 1],
  ['ফেব্রুয়ারি', 2],
  ['ফেব্রুয়ারী', 2],
  ['মার্চ', 3],
  ['এপ্রিল', 4],
  ['মে', 5],
  ['জুন', 6],
  ['জুলাই', 7],
  ['আগস্ট', 8],
  ['আগষ্ট', 8],
  ['সেপ্টেম্বর', 9],
  ['অক্টোবর', 10],
  ['নভেম্বর', 11],
  ['ডিসেম্বর', 12],
  ['january', 1],
  ['february', 2],
  ['march', 3],
  ['april', 4],
  ['may', 5],
  ['june', 6],
  ['july', 7],
  ['august', 8],
  ['september', 9],
  ['october', 10],
  ['november', 11],
  ['december', 12],
];

/** ZWJ / ZWNJ: OCR and Word put them between Bangla letters at random. */
const JOINERS = /[\u200c\u200d]/g;

function clean(text: string): string {
  return toAsciiDigits(normalizeBangla(text)).replace(JOINERS, '');
}

const MONTH_BY_NAME = new Map(
  MONTHS.map(([name, month]) => [clean(name).toLowerCase(), month]),
);
const MONTH_ALT = [...MONTH_BY_NAME.keys()]
  .sort((a, b) => b.length - a.length)
  .join('|');
const DAY_PART_BY_WORD = new Map(
  DAY_PART_WORDS.map(([word, part]) => [clean(word), part]),
);
const DAY_PART_ALT = [...DAY_PART_BY_WORD.keys()]
  .sort((a, b) => b.length - a.length)
  .join('|');

/** "১০ নভেম্বর, ২০২৬" / "10 November 2026" (also "১০ই"). */
const NAMED_DATE = new RegExp(
  `(\\d{1,2})\\s*(?:ই|লা|রা|শে|তম)?\\s*(${MONTH_ALT})\\s*[,،]?\\s*(\\d{4})`,
  'iu',
);
/** "১০/১১/২০২৬", "১০-১১-২০২৬", "১০.১১.২০২৬" (day first, as in all our notices). */
const NUMERIC_DATE =
  /(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})(?!\d)/u;

/** Returns `YYYY-MM-DD` or null (also for an impossible date like 31 নভেম্বর). */
export function parseNoticeDate(text: string): string | null {
  const t = clean(text);
  const named = NAMED_DATE.exec(t);
  const parts = named
    ? {
        day: Number(named[1]),
        month: MONTH_BY_NAME.get(named[2].toLowerCase()) ?? 0,
        year: Number(named[3]),
      }
    : (() => {
        const n = NUMERIC_DATE.exec(t);
        return n
          ? { day: Number(n[1]), month: Number(n[2]), year: Number(n[3]) }
          : null;
      })();
  if (!parts) return null;
  const dt = DateTime.fromObject(parts, { zone: DHAKA_TZ });
  return dt.isValid ? dt.toFormat('yyyy-MM-dd') : null;
}

export interface Clock {
  hour: number;
  minute: number;
  /** True when no day-part word was given and 1–7 o'clock was read as afternoon. */
  assumedAfternoon: boolean;
}

/**
 * Converts a 12-hour reading with a Bangla day-part word to 24 h.
 * - সকাল / পূর্বাহ্ন: as written (সকাল ১২ = 12:00).
 * - দুপুর: 12 stays 12, 1–6 → +12, otherwise as written (দুপুর ১১.৩০ = 11:30).
 * - বেলা: 12 stays 12, 1–7 → +12, 8–11 as written.
 * - বিকাল / বিকেল / অপরাহ্ন, সন্ধ্যা: 1–11 → +12.
 * - রাত: 6–11 → +12, 12 → 0, otherwise as written.
 * - no word: 13–23 as written; 1–7 → +12 (assumption, reported); 8–12 as written.
 * Hours already 13–23 are kept. Returns null for impossible values.
 */
export function to24Hour(
  hour: number,
  minute: number,
  part: DayPart | null,
): Clock | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const clock = (h: number, assumedAfternoon = false): Clock => ({
    hour: h,
    minute,
    assumedAfternoon,
  });
  if (hour >= 13 || hour === 0) return clock(hour);
  switch (part) {
    case 'morning':
      return clock(hour);
    case 'noon':
      return clock(hour >= 1 && hour <= 6 ? hour + 12 : hour);
    case 'daytime':
      return clock(hour >= 1 && hour <= 7 ? hour + 12 : hour);
    case 'afternoon':
    case 'evening':
      return clock(hour === 12 ? 12 : hour + 12);
    case 'night':
      if (hour === 12) return clock(0);
      return clock(hour >= 6 ? hour + 12 : hour);
    default:
      return hour >= 1 && hour <= 7 ? clock(hour + 12, true) : clock(hour);
  }
}

/** "১২.০০", "১২:০০", "৩.৩০", or "১১টা" / "১১ ঘটিকা". */
const TIME = new RegExp(
  `(?:(${DAY_PART_ALT})\\s*(?::|ঃ)?\\s*)?(?<!\\d)(\\d{1,2})\\s*(?:(?:[.:]|ঃ)\\s*(\\d{2})(?!\\d)|(?=\\s*(?:টা|ঘটিকা)))`,
  'u',
);

/** The start time `HH:mm` (and whether 1–7 was assumed afternoon), or null. */
export function parseNoticeTime(
  text: string,
): { time: string; assumedAfternoon: boolean } | null {
  // Remove dates first, so "১০.১১.২০২৬" or the day of "১০ নভেম্বর" is never read as a time.
  const t = clean(text)
    .replace(new RegExp(NAMED_DATE.source, 'giu'), ' ')
    .replace(new RegExp(NUMERIC_DATE.source, 'gu'), ' ');
  const m = TIME.exec(t);
  if (!m) return null;
  let part: DayPart | null = m[1] ? (DAY_PART_BY_WORD.get(m[1]) ?? null) : null;
  if (!part) {
    // A word elsewhere in the line ("১২.০০ ঘটিকা (দুপুর)").
    const word = new RegExp(DAY_PART_ALT, 'u').exec(t);
    part = word ? (DAY_PART_BY_WORD.get(word[0]) ?? null) : null;
  }
  const c = to24Hour(Number(m[2]), m[3] ? Number(m[3]) : 0, part);
  if (!c) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${pad(c.hour)}:${pad(c.minute)}`,
    assumedAfternoon: c.assumedAfternoon,
  };
}

/** `HH:mm` + minutes on the given Dhaka date (no wrap past midnight: then null). */
export function addMinutes(
  date: string,
  time: string,
  minutes: number,
): string | null {
  const start = DateTime.fromISO(`${date}T${time}`, { zone: DHAKA_TZ });
  if (!start.isValid) return null;
  const end = start.plus({ minutes });
  return end.hasSame(start, 'day') ? end.toFormat('HH:mm') : null;
}

export interface NoticeDateTime {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  assumedAfternoon: boolean;
}

/** The "তারিখ ও সময়" value → date, start and end (= start + 45 min, Asia/Dhaka). */
export function parseNoticeDateTime(text: string): NoticeDateTime {
  const date = parseNoticeDate(text);
  const time = parseNoticeTime(text);
  const startTime = time?.time ?? null;
  let endTime: string | null = null;
  if (startTime) {
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + DEFAULT_DURATION_MINUTES;
    endTime =
      date !== null
        ? addMinutes(date, startTime, DEFAULT_DURATION_MINUTES)
        : total < 24 * 60
          ? `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
          : null;
  }
  return {
    date,
    startTime,
    endTime,
    assumedAfternoon: time?.assumedAfternoon ?? false,
  };
}
