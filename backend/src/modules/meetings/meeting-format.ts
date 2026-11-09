import { DateTime } from 'luxon';
import { DHAKA_TZ } from '../../common/utils/time';

/** Bangla part of day, e.g. "সকাল ১০:৩০". */
function partOfDay(hour: number): string {
  if (hour >= 4 && hour < 12) return 'সকাল';
  if (hour >= 12 && hour < 15) return 'দুপুর';
  if (hour >= 15 && hour < 18) return 'বিকাল';
  if (hour >= 18 && hour < 20) return 'সন্ধ্যা';
  return 'রাত';
}

function dhaka(date: Date): DateTime {
  return DateTime.fromJSDate(date, { zone: DHAKA_TZ }).setLocale('bn');
}

export function formatDhakaTime(date: Date): string {
  const d = dhaka(date);
  return `${partOfDay(d.hour)} ${d.toFormat('h:mm')}`;
}

/** "১ ডিসেম্বর ২০২৬ (মঙ্গলবার), সকাল ১০:৩০ – সকাল ১১:৩০" (Asia/Dhaka, Bangla digits). */
export function formatDhakaRange(startAt: Date, endAt: Date): string {
  const s = dhaka(startAt);
  const e = dhaka(endAt);
  const day = s.toFormat('d MMMM yyyy (cccc)');
  const end = s.hasSame(e, 'day')
    ? formatDhakaTime(endAt)
    : `${e.toFormat('d MMMM yyyy')}, ${formatDhakaTime(endAt)}`;
  return `${day}, ${formatDhakaTime(startAt)} – ${end}`;
}
