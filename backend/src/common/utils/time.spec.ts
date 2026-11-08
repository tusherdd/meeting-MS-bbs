import {
  getDayRange,
  getFiscalYearRange,
  getMonthRange,
  getPeriodRange,
  getWeekRange,
  getYearRange,
  toDhakaDateString,
  toDhakaDateTime,
  type DateRange,
} from './time';

// Asia/Dhaka is UTC+6, so local midnight is 18:00 UTC of the previous day.
const iso = (r: DateRange) => ({
  start: r.start.toISOString(),
  end: r.end.toISOString(),
});

describe('time utils (Asia/Dhaka)', () => {
  describe('toDhakaDateTime', () => {
    it('treats a date-only string as that calendar day in Dhaka', () => {
      expect(toDhakaDateTime('2026-11-08').toUTC().toISO()).toBe(
        '2026-11-07T18:00:00.000Z',
      );
    });

    it('throws on invalid input', () => {
      expect(() => toDhakaDateTime('not-a-date')).toThrow(RangeError);
      expect(() => toDhakaDateTime(new Date('invalid'))).toThrow(RangeError);
    });
  });

  describe('getDayRange', () => {
    it('returns Dhaka midnight to next midnight', () => {
      expect(iso(getDayRange('2026-11-08'))).toEqual({
        start: '2026-11-07T18:00:00.000Z',
        end: '2026-11-08T18:00:00.000Z',
      });
    });

    it('uses the Dhaka date, not the UTC date, for late-UTC instants', () => {
      // 19:30 UTC on 8 Nov = 01:30 on 9 Nov in Dhaka.
      expect(iso(getDayRange(new Date('2026-11-08T19:30:00Z')))).toEqual({
        start: '2026-11-08T18:00:00.000Z',
        end: '2026-11-09T18:00:00.000Z',
      });
    });
  });

  describe('getWeekRange (Sunday–Saturday)', () => {
    const week = {
      start: '2026-11-07T18:00:00.000Z',
      end: '2026-11-14T18:00:00.000Z',
    };

    it('starts on Sunday when the date is a Sunday', () => {
      expect(iso(getWeekRange('2026-11-08'))).toEqual(week); // Sunday
    });

    it('maps a mid-week day to the same week', () => {
      expect(iso(getWeekRange('2026-11-11'))).toEqual(week); // Wednesday
    });

    it('includes Saturday late evening in the same week', () => {
      expect(iso(getWeekRange('2026-11-14T23:59:59+06:00'))).toEqual(week); // Saturday
    });

    it('starts a new week on the next Sunday', () => {
      expect(iso(getWeekRange('2026-11-15')).start).toBe(
        '2026-11-14T18:00:00.000Z',
      );
    });

    it('works across a month and year boundary', () => {
      // Thursday 1 Jan 2026 → week from Sunday 28 Dec 2025.
      expect(iso(getWeekRange('2026-01-01'))).toEqual({
        start: '2025-12-27T18:00:00.000Z',
        end: '2026-01-03T18:00:00.000Z',
      });
    });
  });

  describe('getMonthRange', () => {
    it('handles leap-year February', () => {
      expect(iso(getMonthRange('2028-02-15'))).toEqual({
        start: '2028-01-31T18:00:00.000Z',
        end: '2028-02-29T18:00:00.000Z',
      });
    });

    it('rolls December into January of the next year', () => {
      expect(iso(getMonthRange('2026-12-31')).end).toBe(
        '2026-12-31T18:00:00.000Z',
      );
    });
  });

  describe('getYearRange (January–December)', () => {
    it('returns the calendar year in Dhaka', () => {
      expect(iso(getYearRange('2026-05-01'))).toEqual({
        start: '2025-12-31T18:00:00.000Z',
        end: '2026-12-31T18:00:00.000Z',
      });
    });
  });

  describe('getFiscalYearRange (July–June)', () => {
    const fy2026_27 = {
      start: '2026-06-30T18:00:00.000Z',
      end: '2027-06-30T18:00:00.000Z',
    };

    it('uses the current year when the month is July or later', () => {
      expect(iso(getFiscalYearRange('2026-11-08'))).toEqual(fy2026_27);
      expect(iso(getFiscalYearRange('2026-07-01'))).toEqual(fy2026_27);
    });

    it('uses the previous year when the month is before July', () => {
      expect(iso(getFiscalYearRange('2026-06-30'))).toEqual({
        start: '2025-06-30T18:00:00.000Z',
        end: '2026-06-30T18:00:00.000Z',
      });
      expect(iso(getFiscalYearRange('2027-01-15'))).toEqual(fy2026_27);
    });

    it('switches exactly at Dhaka midnight on 1 July', () => {
      expect(
        iso(getFiscalYearRange(new Date('2026-06-30T17:59:59.999Z'))).start,
      ).toBe('2025-06-30T18:00:00.000Z');
      expect(
        iso(getFiscalYearRange(new Date('2026-06-30T18:00:00.000Z'))),
      ).toEqual(fy2026_27);
    });
  });

  describe('getPeriodRange', () => {
    it('dispatches to the right helper', () => {
      const d = '2026-11-08';
      expect(getPeriodRange('day', d)).toEqual(getDayRange(d));
      expect(getPeriodRange('week', d)).toEqual(getWeekRange(d));
      expect(getPeriodRange('month', d)).toEqual(getMonthRange(d));
      expect(getPeriodRange('year', d)).toEqual(getYearRange(d));
      expect(getPeriodRange('fiscal-year', d)).toEqual(getFiscalYearRange(d));
    });

    it('rejects an unknown period', () => {
      expect(() => getPeriodRange('decade' as never, '2026-11-08')).toThrow(
        RangeError,
      );
    });

    it('defaults to now', () => {
      const { start, end } = getPeriodRange('day');
      const now = Date.now();
      expect(start.getTime()).toBeLessThanOrEqual(now);
      expect(end.getTime()).toBeGreaterThan(now);
    });
  });

  describe('toDhakaDateString', () => {
    it('returns the Dhaka calendar date', () => {
      expect(toDhakaDateString(new Date('2026-11-08T19:30:00Z'))).toBe(
        '2026-11-09',
      );
      expect(toDhakaDateString(new Date('2026-11-08T17:59:00Z'))).toBe(
        '2026-11-08',
      );
    });
  });
});
