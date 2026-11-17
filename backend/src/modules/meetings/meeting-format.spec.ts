import {
  formatDhakaRange,
  formatDhakaTime,
  NO_VENUE_BN,
  organizerLabelBn,
} from './meeting-format';

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

describe('organizerLabelBn (v1.9: organizer shown as the wing)', () => {
  it('shows the wing', () => {
    expect(organizerLabelBn('কম্পিউটার উইং', 'উপপরিচালক')).toBe(
      'কম্পিউটার উইং',
    );
  });

  it('falls back to the designation when there is no wing', () => {
    expect(organizerLabelBn(null, 'উপপরিচালক')).toBe('উপপরিচালক');
    expect(organizerLabelBn('  ', 'উপপরিচালক')).toBe('উপপরিচালক');
  });

  it('shows a dash when there is neither', () => {
    expect(organizerLabelBn(null, null)).toBe('—');
  });

  it('has one text for a missing venue', () => {
    expect(NO_VENUE_BN).toBe('স্থান উল্লেখ নেই');
  });
});
