import { formatDhakaRange, formatDhakaTime } from './meeting-format';

describe('Dhaka time formatting (Bangla)', () => {
  it('formats in Asia/Dhaka with Bangla digits and part of day', () => {
    // 04:30 UTC = 10:30 in Dhaka
    expect(formatDhakaTime(new Date('2026-12-01T04:30:00Z'))).toBe(
      'সকাল ১০:৩০',
    );
    expect(formatDhakaTime(new Date('2026-12-01T09:00:00Z'))).toBe(
      'বিকাল ৩:০০',
    );
  });

  it('formats a same-day range with weekday', () => {
    expect(
      formatDhakaRange(
        new Date('2026-12-01T04:30:00Z'),
        new Date('2026-12-01T05:30:00Z'),
      ),
    ).toBe('১ ডিসেম্বর ২০২৬ (মঙ্গলবার), সকাল ১০:৩০ – সকাল ১১:৩০');
  });

  it('uses the Dhaka date, not the UTC date', () => {
    // 19:00 UTC on 30 Nov = 01:00 on 1 Dec in Dhaka
    expect(
      formatDhakaRange(
        new Date('2026-11-30T19:00:00Z'),
        new Date('2026-11-30T20:00:00Z'),
      ),
    ).toMatch(/^১ ডিসেম্বর/);
  });
});
