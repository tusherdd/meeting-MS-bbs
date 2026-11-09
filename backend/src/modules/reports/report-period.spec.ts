import { BadRequestException } from '@nestjs/common';
import { resolvePeriod } from './report-period';

describe('resolvePeriod (Asia/Dhaka)', () => {
  it.each([
    [
      'day',
      '2026-12-01',
      '2026-11-30T18:00:00.000Z',
      '2026-12-01T18:00:00.000Z',
      '১ ডিসেম্বর ২০২৬ (মঙ্গলবার)',
      '2026-12-01',
    ],
    [
      'week',
      '2026-12-01',
      '2026-11-28T18:00:00.000Z',
      '2026-12-05T18:00:00.000Z',
      '২৯ নভেম্বর – ৫ ডিসেম্বর ২০২৬ (সপ্তাহ)',
      'week-2026-11-29',
    ],
    [
      'month',
      '2026-12-15',
      '2026-11-30T18:00:00.000Z',
      '2026-12-31T18:00:00.000Z',
      'ডিসেম্বর ২০২৬',
      '2026-12',
    ],
    [
      'year',
      '2026-12-15',
      '2025-12-31T18:00:00.000Z',
      '2026-12-31T18:00:00.000Z',
      '২০২৬ সাল',
      '2026',
    ],
    [
      'fiscal-year',
      '2026-12-15',
      '2026-06-30T18:00:00.000Z',
      '2027-06-30T18:00:00.000Z',
      '২০২৬-২৭ অর্থবছর',
      'fy-2026-27',
    ],
  ] as const)('%s', (period, date, start, end, label, key) => {
    const p = resolvePeriod(period, date);
    expect(p.range.start.toISOString()).toBe(start);
    expect(p.range.end.toISOString()).toBe(end);
    expect(p.labelBn).toBe(label);
    expect(p.fileKey).toBe(key);
  });

  it('defaults to today in Dhaka', () => {
    // 19:00 UTC on 9 Nov = 10 Nov in Dhaka
    expect(
      resolvePeriod('day', undefined, new Date('2026-11-09T19:00:00Z')).date,
    ).toBe('2026-11-10');
  });

  it('rejects an invalid date', () => {
    expect(() => resolvePeriod('day', '2026-02-30')).toThrow(
      BadRequestException,
    );
  });
});
