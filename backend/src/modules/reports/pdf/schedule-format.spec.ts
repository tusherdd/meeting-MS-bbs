import { DateTime } from 'luxon';
import { DHAKA_TZ } from '../../../common/utils/time';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import type { ReportMeeting } from '../report-math';
import {
  dayPartBn,
  groupByDate,
  headerDesignationBn,
  paginateRows,
  scheduleDate,
  scheduleTime,
  scheduleTitleBn,
  takesHonorific,
  toScheduleRows,
  withJanab,
} from './schedule-format';

/** A Dhaka wall-clock time as a UTC Date. */
const dhaka = (iso: string) =>
  DateTime.fromISO(iso, { zone: DHAKA_TZ }).toJSDate();

function reportMeeting(over: Partial<ReportMeeting> = {}): ReportMeeting {
  const startAt = over.startAt ?? dhaka('2026-11-18T10:00');
  return {
    id: 'm1',
    title: 'সভা',
    startAt,
    endAt: new Date(startAt.getTime() + 3_600_000),
    room: 'কক্ষ ৫০১',
    status: MeetingStatus.SCHEDULED,
    organizerId: 'o',
    organizerNameBn: 'আয়োজক ব্যক্তি',
    organizerNameEn: 'EN_ONLY organizer',
    organizerDesignationId: 'd',
    organizerDesignationBn: 'উপপরিচালক',
    organizerDesignationEn: 'EN_ONLY designation',
    organizerDesignationPriority: 6,
    organizerWingId: 'w',
    organizerWingBn: 'কম্পিউটার উইং',
    organizerWingEn: 'EN_ONLY wing',
    myRole: null,
    chairNameBn: 'মোঃ কামরুল হাসান',
    chairNameEn: 'EN_ONLY chair',
    chairDesignationBn: 'মহাপরিচালক',
    guests: [],
    ...over,
  };
}

describe('report PDF "কর্মসূচি" rules (v1.14)', () => {
  it('title per period', () => {
    expect(scheduleTitleBn('day')).toBe(
      'বাংলাদেশ পরিসংখ্যান ব্যুরো — দৈনিক কর্মসূচি',
    );
    expect(scheduleTitleBn('week')).toBe(
      'বাংলাদেশ পরিসংখ্যান ব্যুরো — সাপ্তাহিক কর্মসূচি',
    );
    expect(scheduleTitleBn('month')).toBe(
      'বাংলাদেশ পরিসংখ্যান ব্যুরো — মাসিক কর্মসূচি',
    );
    expect(scheduleTitleBn('year')).toBe(
      'বাংলাদেশ পরিসংখ্যান ব্যুরো — বার্ষিক কর্মসূচি',
    );
  });

  it.each([
    ['00:30', 'সকাল', '১২.৩০'],
    ['09:05', 'সকাল', '০৯.০৫'],
    ['11:59', 'সকাল', '১১.৫৯'],
    ['12:00', 'দুপুর', '১২.০০'],
    ['14:59', 'দুপুর', '০২.৫৯'],
    ['15:00', 'বিকাল', '০৩.০০'],
    ['17:59', 'বিকাল', '০৫.৫৯'],
    ['18:00', 'সন্ধ্যা', '০৬.০০'],
    ['19:59', 'সন্ধ্যা', '০৭.৫৯'],
    ['20:00', 'রাত', '০৮.০০'],
    ['23:45', 'রাত', '১১.৪৫'],
  ])('Dhaka %s → %s %s', (time, part, clock) => {
    expect(scheduleTime(dhaka(`2026-11-18T${time}`))).toEqual({
      partBn: part,
      timeBn: clock,
    });
  });

  it('day parts by hour', () => {
    expect([0, 11, 12, 14, 15, 17, 18, 19, 20, 23].map(dayPartBn)).toEqual([
      'সকাল',
      'সকাল',
      'দুপুর',
      'দুপুর',
      'বিকাল',
      'বিকাল',
      'সন্ধ্যা',
      'সন্ধ্যা',
      'রাত',
      'রাত',
    ]);
  });

  it('date as dd/mm/yyyy in Bangla digits with the Bangla weekday (Dhaka day)', () => {
    expect(scheduleDate(dhaka('2026-11-14T10:00'))).toEqual({
      key: '2026-11-14',
      dateBn: '১৪/১১/২০২৬',
      weekdayBn: 'শনিবার',
    });
    // 20:30 UTC on the 18th is already the 19th in Dhaka (UTC+6).
    expect(scheduleDate(new Date('2026-11-18T20:30:00Z')).weekdayBn).toBe(
      'বৃহস্পতিবার',
    );
  });

  it('"জনাব" is added once and never doubled', () => {
    expect(withJanab('মোঃ আরিফুল হক')).toBe('জনাব মোঃ আরিফুল হক');
    expect(withJanab('জনাব মোঃ আরিফুল হক')).toBe('জনাব মোঃ আরিফুল হক');
    expect(withJanab('  জনাব শামীম  ')).toBe('জনাব শামীম');
    expect(withJanab(withJanab('রহিম'))).toBe('জনাব রহিম');
    expect(withJanab('')).toBe('—');
    expect(withJanab(null)).toBe('—');
  });

  it('"মহোদয়" only for designation priority 1, 2 or 3', () => {
    expect([0, 1, 2, 3, 4, 7].map((p) => takesHonorific(p))).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(takesHonorific(null)).toBe(false);
    expect(headerDesignationBn('সচিব', 1)).toBe('সচিব মহোদয়');
    expect(headerDesignationBn('মহাপরিচালক', 2)).toBe('মহাপরিচালক মহোদয়');
    expect(headerDesignationBn('উপমহাপরিচালক', 3)).toBe('উপমহাপরিচালক মহোদয়');
    expect(headerDesignationBn('পরিচালক', 4)).toBe('পরিচালক');
    expect(headerDesignationBn('প্রোগ্রামার', 6)).toBe('প্রোগ্রামার');
    // SUPER_ADMIN has no designation.
    expect(headerDesignationBn(null, null)).toBe('—');
  });

  it('rows: cancelled meetings left out, sorted by start time', () => {
    const rows = toScheduleRows([
      reportMeeting({
        id: 'late',
        title: 'late',
        startAt: dhaka('2026-11-18T15:00'),
      }),
      reportMeeting({
        id: 'cancelled',
        title: 'cancelled',
        status: MeetingStatus.CANCELLED,
      }),
      reportMeeting({
        id: 'done',
        title: 'done',
        status: MeetingStatus.COMPLETED,
        startAt: dhaka('2026-11-17T09:00'),
      }),
      reportMeeting({
        id: 'early',
        title: 'early',
        startAt: dhaka('2026-11-18T10:00'),
      }),
    ]);
    expect(rows.map((r) => r.title)).toEqual(['done', 'early', 'late']);
  });

  it('chair: internal or guest chair with "জনাব" and designation; no chair → null', () => {
    const [internal, guest, none, already] = toScheduleRows([
      reportMeeting({ id: 'a' }),
      reportMeeting({
        id: 'b',
        chairNameBn: 'Dr. Guest Chair',
        chairDesignationBn: 'Consultant, UNFPA',
        startAt: dhaka('2026-11-18T11:00'),
      }),
      reportMeeting({
        id: 'c',
        chairNameBn: null,
        chairDesignationBn: null,
        startAt: dhaka('2026-11-18T12:00'),
      }),
      reportMeeting({
        id: 'd',
        chairNameBn: 'জনাব শামীম আহমেদ',
        chairDesignationBn: 'সচিব',
        startAt: dhaka('2026-11-18T13:00'),
      }),
    ]);
    expect(internal.chair).toEqual({
      nameBn: 'জনাব মোঃ কামরুল হাসান',
      designationBn: 'মহাপরিচালক',
    });
    expect(guest.chair).toEqual({
      nameBn: 'জনাব Dr. Guest Chair',
      designationBn: 'Consultant, UNFPA',
    });
    expect(none.chair).toBeNull();
    // No "মহোদয়" in the table, even for priority 1; "জনাব" not doubled.
    expect(already.chair).toEqual({
      nameBn: 'জনাব শামীম আহমেদ',
      designationBn: 'সচিব',
    });
  });

  it('organizer as the Bangla wing (fallback designation); missing venue says so', () => {
    const [withWing, noWing] = toScheduleRows([
      reportMeeting({ id: 'a', room: null }),
      reportMeeting({
        id: 'b',
        organizerWingBn: null,
        room: '  ',
        startAt: dhaka('2026-11-18T11:00'),
      }),
    ]);
    expect(withWing.organizerBn).toBe('কম্পিউটার উইং');
    expect(noWing.organizerBn).toBe('উপপরিচালক');
    expect(withWing.venueBn).toBe('স্থান উল্লেখ নেই');
    expect(noWing.venueBn).toBe('স্থান উল্লেখ নেই');
  });

  it('groups consecutive rows of the same day', () => {
    const groups = groupByDate([
      { dateKey: 'a', n: 1 },
      { dateKey: 'a', n: 2 },
      { dateKey: 'b', n: 3 },
      { dateKey: 'c', n: 4 },
      { dateKey: 'c', n: 5 },
    ]);
    expect(groups.map((g) => g.map((r) => r.n))).toEqual([[1, 2], [3], [4, 5]]);
    expect(groupByDate([])).toEqual([]);
  });

  describe('paginateRows', () => {
    const layout = { firstPage: 300, otherPages: 500, tableHeader: 50 };

    it('fills the first page, then the next ones; every page leaves room for the header', () => {
      // first page: 250 for rows → 100 + 100; then 450 per page.
      expect(paginateRows([100, 100, 100, 200, 200, 10], layout)).toEqual([
        [0, 1],
        [2, 3],
        [4, 5],
      ]);
    });

    it('a row that exactly fits stays; a row taller than a page gets its own page', () => {
      expect(paginateRows([250, 1], layout)).toEqual([[0], [1]]);
      expect(paginateRows([10, 900, 10], layout)).toEqual([[0], [1], [2]]);
    });

    it('no rows → no pages', () => {
      expect(paginateRows([], layout)).toEqual([]);
    });
  });
});
