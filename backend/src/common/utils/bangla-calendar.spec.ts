import {
  banglaMonthLengths,
  formatBanglaCalendarDate,
  formatGregorianDateBn,
  toBanglaDate,
} from './bangla-calendar';

/** Noon in Dhaka on a calendar day (06:00 UTC), so the UTC date never differs. */
const dhakaNoon = (iso: string) => new Date(`${iso}T06:00:00Z`);

describe('Bangla calendar (revised Bangabda, 2019)', () => {
  it.each([
    ['2026-11-09', '২৪ কার্তিক, ১৪৩৩'],
    ['2026-11-17', '২ অগ্রহায়ণ, ১৪৩৩'],
    ['2026-04-14', '১ বৈশাখ, ১৪৩৩'],
    ['2026-04-13', '৩০ চৈত্র, ১৪৩২'],
  ])('%s → %s', (iso, expected) => {
    expect(formatBanglaCalendarDate(dhakaNoon(iso))).toBe(expected);
  });

  it('Falgun has 30 days in a Gregorian leap year (2024)', () => {
    // 1 Falgun = 14 February; Feb 2024 has 29 days, so 30 Falgun 1430 = 14 March 2024.
    expect(toBanglaDate(dhakaNoon('2024-02-14'))).toEqual({
      day: 1,
      monthIndex: 10,
      year: 1430,
    });
    expect(toBanglaDate(dhakaNoon('2024-03-14'))).toEqual({
      day: 30,
      monthIndex: 10,
      year: 1430,
    });
    expect(toBanglaDate(dhakaNoon('2024-03-15'))).toEqual({
      day: 1,
      monthIndex: 11,
      year: 1430,
    });
    expect(banglaMonthLengths(2023)[10]).toBe(30);
  });

  it('Falgun has 29 days in a common year (2026)', () => {
    expect(toBanglaDate(dhakaNoon('2026-03-14'))).toEqual({
      day: 29,
      monthIndex: 10,
      year: 1432,
    });
    expect(toBanglaDate(dhakaNoon('2026-03-15'))).toEqual({
      day: 1,
      monthIndex: 11,
      year: 1432,
    });
    expect(banglaMonthLengths(2025)[10]).toBe(29);
  });

  it('every year has 365 or 366 days and ends on 13 April', () => {
    for (const start of [2023, 2024, 2025, 2026, 2027]) {
      const total = banglaMonthLengths(start).reduce((a, b) => a + b, 0);
      const days = Math.round(
        (Date.UTC(start + 1, 3, 14) - Date.UTC(start, 3, 14)) / 86_400_000,
      );
      expect(total).toBe(days);
    }
  });

  it('uses the Asia/Dhaka day, not the UTC day', () => {
    // 2026-04-13 20:00 UTC = 14 April 02:00 in Dhaka → 1 Boishakh.
    expect(formatBanglaCalendarDate(new Date('2026-04-13T20:00:00Z'))).toBe(
      '১ বৈশাখ, ১৪৩৩',
    );
  });

  it('formats the Gregorian date in Bangla', () => {
    expect(formatGregorianDateBn(dhakaNoon('2026-11-17'))).toBe(
      '১৭ নভেম্বর, ২০২৬',
    );
  });
});
