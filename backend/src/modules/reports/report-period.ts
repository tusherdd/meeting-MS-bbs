import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { toBanglaDigits } from '../../common/utils/digits';
import {
  DHAKA_TZ,
  getPeriodRange,
  toDhakaDateString,
  type DateRange,
  type ReportPeriod,
} from '../../common/utils/time';

export interface ResolvedPeriod {
  period: ReportPeriod;
  /** The reference day (YYYY-MM-DD, Dhaka). */
  date: string;
  range: DateRange;
  /** Bangla label, e.g. "ডিসেম্বর ২০২৬". */
  labelBn: string;
  /** Safe file-name part, e.g. "2026-12". */
  fileKey: string;
}

const bn = (d: DateTime) => d.setLocale('bn');

/**
 * Period → Dhaka range [start, end) via common/utils/time (SPEC.md §6.6) plus Bangla label and
 * a file-name key. `date` defaults to today in Dhaka.
 */
export function resolvePeriod(
  period: ReportPeriod,
  date?: string,
  now = new Date(),
): ResolvedPeriod {
  const day = date ?? toDhakaDateString(now);
  let range: DateRange;
  try {
    range = getPeriodRange(period, day);
  } catch {
    throw new BadRequestException('সঠিক তারিখ দিন (YYYY-MM-DD)।');
  }
  const start = DateTime.fromJSDate(range.start, { zone: DHAKA_TZ });
  const lastDay = DateTime.fromJSDate(range.end, { zone: DHAKA_TZ }).minus({
    days: 1,
  });

  let labelBn: string;
  let fileKey: string;
  switch (period) {
    case 'day':
      labelBn = bn(start).toFormat('d MMMM yyyy (cccc)');
      fileKey = start.toFormat('yyyy-MM-dd');
      break;
    case 'week':
      labelBn = `${bn(start).toFormat('d MMMM')} – ${bn(lastDay).toFormat('d MMMM yyyy')} (সপ্তাহ)`;
      fileKey = `week-${start.toFormat('yyyy-MM-dd')}`;
      break;
    case 'month':
      labelBn = bn(start).toFormat('MMMM yyyy');
      fileKey = start.toFormat('yyyy-MM');
      break;
    case 'year':
      labelBn = `${toBanglaDigits(start.year)} সাল`;
      fileKey = String(start.year);
      break;
    case 'fiscal-year': {
      const fy = `${start.year}-${String((start.year + 1) % 100).padStart(2, '0')}`;
      labelBn = `${toBanglaDigits(fy)} অর্থবছর`;
      fileKey = `fy-${fy}`;
      break;
    }
  }
  return { period, date: day, range, labelBn, fileKey };
}
