import {
  addMinutes,
  parseNoticeDate,
  parseNoticeDateTime,
  parseNoticeTime,
  to24Hour,
} from './notice-time';

describe('to24Hour (v1.21, SPEC.md §6.12)', () => {
  it.each([
    [12, 0, 'daytime', 12, 0], // বেলা ১২.০০
    [2, 0, 'daytime', 14, 0], // বেলা ২.০০
    [11, 0, 'daytime', 11, 0], // বেলা ১১.০০
    [3, 30, 'afternoon', 15, 30], // বিকাল ৩.৩০
    [10, 30, 'morning', 10, 30], // সকাল ১০.৩০
    [12, 0, 'noon', 12, 0], // দুপুর ১২.০০
    [1, 0, 'noon', 13, 0], // দুপুর ১.০০
    [11, 30, 'noon', 11, 30], // দুপুর ১১.৩০
    [6, 0, 'evening', 18, 0], // সন্ধ্যা ৬.০০
    [9, 0, 'night', 21, 0], // রাত ৯.০০
    [12, 0, 'night', 0, 0], // রাত ১২.০০
    [15, 0, 'morning', 15, 0], // already 24 h
  ] as const)('%i:%i %s → %i:%i', (h, m, part, eh, em) => {
    expect(to24Hour(h, m, part)).toEqual({
      hour: eh,
      minute: em,
      assumedAfternoon: false,
    });
  });

  it('without a word: 8–12 as written, 1–7 afternoon (reported as assumed)', () => {
    expect(to24Hour(10, 0, null)).toEqual({
      hour: 10,
      minute: 0,
      assumedAfternoon: false,
    });
    expect(to24Hour(2, 30, null)).toEqual({
      hour: 14,
      minute: 30,
      assumedAfternoon: true,
    });
  });

  it('refuses impossible values', () => {
    expect(to24Hour(25, 0, null)).toBeNull();
    expect(to24Hour(10, 60, 'morning')).toBeNull();
  });
});

describe('parseNoticeDate', () => {
  it('reads Bangla digits and month names', () => {
    expect(parseNoticeDate('১০ নভেম্বর, ২০২৬')).toBe('2026-11-10');
    expect(parseNoticeDate('০৫ জানুয়ারি ২০২৭')).toBe('2027-01-05');
    expect(parseNoticeDate('১লা মার্চ, ২০২৭')).toBe('2027-03-01');
  });

  it('reads day-first numeric dates', () => {
    expect(parseNoticeDate('১০/১১/২০২৬ খ্রি.')).toBe('2026-11-10');
    expect(parseNoticeDate('10-11-2026')).toBe('2026-11-10');
  });

  it('returns null for missing or impossible dates (never guesses)', () => {
    expect(parseNoticeDate('বেলা ১২.০০ ঘটিকা')).toBeNull();
    expect(parseNoticeDate('৩১ নভেম্বর, ২০২৬')).toBeNull();
  });
});

describe('parseNoticeTime', () => {
  it('reads "বেলা : ১২.০০ ঘটিকা" and does not take the date as a time', () => {
    expect(parseNoticeTime('১০.১১.২০২৬; বেলা : ১২.০০ ঘটিকা')).toEqual({
      time: '12:00',
      assumedAfternoon: false,
    });
  });

  it('reads a colon, an hour with "টা" and a day-part word after the time', () => {
    expect(parseNoticeTime('সকাল ১০:৩০ টা')?.time).toBe('10:30');
    expect(parseNoticeTime('সকাল ১১টা')?.time).toBe('11:00');
    expect(parseNoticeTime('৩.৩০ ঘটিকা (বিকাল)')?.time).toBe('15:30');
  });

  it('returns null when there is no time', () => {
    expect(parseNoticeTime('১০ নভেম্বর, ২০২৬')).toBeNull();
  });
});

describe('parseNoticeDateTime', () => {
  it('the real notice line: date, start and start + 45 min', () => {
    expect(parseNoticeDateTime('১০ নভেম্বর, ২০২৬; বেলা : ১২.০০ ঘটিকা')).toEqual(
      {
        date: '2026-11-10',
        startTime: '12:00',
        endTime: '12:45',
        assumedAfternoon: false,
      },
    );
  });

  it('বিকাল ৩.৩০ → 15:30–16:15', () => {
    expect(
      parseNoticeDateTime('০৫ জানুয়ারি ২০২৭, বিকাল ৩.৩০ ঘটিকা'),
    ).toMatchObject({
      date: '2027-01-05',
      startTime: '15:30',
      endTime: '16:15',
    });
  });

  it('a time without a date still gets its end; a missing time leaves both null', () => {
    expect(parseNoticeDateTime('বেলা ২.০০ ঘটিকা')).toMatchObject({
      date: null,
      startTime: '14:00',
      endTime: '14:45',
    });
    expect(parseNoticeDateTime('১০ নভেম্বর, ২০২৬')).toMatchObject({
      date: '2026-11-10',
      startTime: null,
      endTime: null,
    });
  });

  it('addMinutes never wraps past midnight', () => {
    expect(addMinutes('2026-11-10', '23:30', 45)).toBeNull();
    expect(addMinutes('2026-11-10', '09:30', 45)).toBe('10:15');
  });
});
