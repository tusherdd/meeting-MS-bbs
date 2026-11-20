import { BadRequestException } from '@nestjs/common';
import {
  resolvePeriod,
  resolveRange,
  resolveReportQuery,
  validateRange,
} from './report-period';

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

describe('custom date range (v1.15)', () => {
  it('both days inclusive, Asia/Dhaka; label and file key', () => {
    const p = resolveRange('2026-11-01', '2026-12-15');
    expect(p.period).toBe('custom');
    expect(p.date).toBe('2026-11-01');
    expect(p.range.start.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    // The end is the day AFTER the last day, 00:00 Dhaka.
    expect(p.range.end.toISOString()).toBe('2026-12-15T18:00:00.000Z');
    expect(p.labelBn).toBe('১ নভেম্বর ২০২৬ – ১৫ ডিসেম্বর ২০২৬');
    expect(p.fileKey).toBe('2026-11-01_2026-12-15');
  });

  it('a one-day range is that whole day', () => {
    const p = resolveRange('2026-11-20', '2026-11-20');
    expect(p.range.start.toISOString()).toBe('2026-11-19T18:00:00.000Z');
    expect(p.range.end.toISOString()).toBe('2026-11-20T18:00:00.000Z');
  });

  it('rules: both dates, end not before start, at most 2 years', () => {
    expect(validateRange('2026-11-01', '2026-11-30')).toBeNull();
    expect(validateRange(undefined, '2026-11-30')).toBe('incomplete');
    expect(validateRange('2026-11-01', undefined)).toBe('incomplete');
    expect(validateRange('2026-02-30', '2026-03-01')).toBe('incomplete');
    expect(validateRange('2026-11-02', '2026-11-01')).toBe('endBeforeStart');
    // Exactly two years (inclusive) is allowed; one more day is not.
    expect(validateRange('2025-01-01', '2026-12-31')).toBeNull();
    expect(validateRange('2025-01-01', '2027-01-01')).toBe('tooLong');
    expect(validateRange('2024-02-29', '2026-02-27')).toBeNull();
  });

  it('throws 400 with the Bangla message', () => {
    expect(() => resolveRange('2026-11-02', '2026-11-01')).toThrow(
      'শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।',
    );
    expect(() => resolveRange('2025-01-01', '2027-01-01')).toThrow(
      'সময়কাল সর্বোচ্চ ২ বছর হতে পারে।',
    );
    expect(() => resolveRange('2026-11-01')).toThrow(BadRequestException);
  });

  it('from / to win over period / date; without them the period is used', () => {
    expect(
      resolveReportQuery({
        period: 'month',
        date: '2026-01-10',
        from: '2026-11-01',
        to: '2026-11-03',
      }).period,
    ).toBe('custom');
    expect(
      resolveReportQuery({ period: 'week', date: '2026-12-01' }).fileKey,
    ).toBe('week-2026-11-29');
    expect(() =>
      resolveReportQuery({ period: 'month', to: '2026-11-03' }),
    ).toThrow(BadRequestException);
  });
});
