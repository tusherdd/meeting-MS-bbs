import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';
import {
  byDay,
  NO_WING_BN,
  officeBreakdown,
  personalSummary,
  statusCounts,
  totalHours,
  type ReportMeeting,
} from './report-math';

let n = 0;
function meeting(overrides: Partial<ReportMeeting> = {}): ReportMeeting {
  n++;
  return {
    id: `m${n}`,
    title: `সভা ${n}`,
    // 10:00–11:30 Dhaka on 1 Dec 2026
    startAt: new Date('2026-12-01T04:00:00Z'),
    endAt: new Date('2026-12-01T05:30:00Z'),
    room: null,
    status: MeetingStatus.COMPLETED,
    organizerId: 'me',
    organizerNameBn: 'আমি',
    organizerDesignationId: 'dd',
    organizerDesignationBn: 'উপপরিচালক',
    organizerDesignationPriority: 6,
    organizerWingId: 'w1',
    organizerWingBn: 'কম্পিউটার উইং',
    myRole: ParticipantRole.ORGANIZER,
    ...overrides,
  };
}

describe('report math', () => {
  it('counts statuses and hours; cancelled meetings take no time', () => {
    const list = [
      meeting(),
      meeting({
        status: MeetingStatus.SCHEDULED,
        endAt: new Date('2026-12-01T05:00:00Z'),
      }),
      meeting({ status: MeetingStatus.CANCELLED }),
    ];
    expect(statusCounts(list)).toEqual({
      SCHEDULED: 1,
      COMPLETED: 1,
      CANCELLED: 1,
    });
    expect(totalHours(list)).toBe(2.5); // 1.5 + 1.0, cancelled not counted
  });

  it('groups by Dhaka day (not UTC day)', () => {
    const late = meeting({
      // 19:00 UTC on 1 Dec = 01:00 on 2 Dec in Dhaka
      startAt: new Date('2026-12-01T19:00:00Z'),
      endAt: new Date('2026-12-01T20:00:00Z'),
    });
    expect(byDay([meeting(), late])).toEqual([
      { date: '2026-12-01', meetings: 1, hours: 1.5 },
      { date: '2026-12-02', meetings: 1, hours: 1 },
    ]);
  });

  it('personal summary: organized vs attended, conflicts passed through', () => {
    const summary = personalSummary(
      [
        meeting(),
        meeting({ organizerId: 'boss', myRole: ParticipantRole.MEMBER }),
        meeting({ status: MeetingStatus.CANCELLED }),
      ],
      'me',
      { againstMine: 2, raisedByMe: 1 },
    );
    expect(summary).toMatchObject({
      totalMeetings: 3,
      organized: 2,
      attended: 1,
      totalHours: 3,
      conflictsRaisedAgainstMyMeetings: 2,
      conflictsIRaised: 1,
      byStatus: { SCHEDULED: 0, COMPLETED: 2, CANCELLED: 1 },
    });
  });

  it('empty period gives zeros, not errors', () => {
    expect(
      personalSummary([], 'me', { againstMine: 0, raisedByMe: 0 }),
    ).toEqual({
      totalMeetings: 0,
      organized: 0,
      attended: 0,
      byStatus: { SCHEDULED: 0, COMPLETED: 0, CANCELLED: 0 },
      totalHours: 0,
      conflictsRaisedAgainstMyMeetings: 0,
      conflictsIRaised: 0,
      byDay: [],
    });
  });

  it('office breakdown: by wing (incl. no wing), by designation in priority order, top organizers, busiest days', () => {
    const list = [
      meeting({ organizerId: 'a', organizerNameBn: 'ক' }),
      meeting({ organizerId: 'a', organizerNameBn: 'ক' }),
      meeting({
        organizerId: 'b',
        organizerNameBn: 'খ',
        organizerWingId: null,
        organizerWingBn: null,
        organizerDesignationId: 'sec',
        organizerDesignationBn: 'সচিব',
        organizerDesignationPriority: 1,
      }),
      meeting({
        organizerId: 'b',
        organizerNameBn: 'খ',
        organizerWingId: null,
        organizerWingBn: null,
        organizerDesignationId: 'sec',
        organizerDesignationBn: 'সচিব',
        organizerDesignationPriority: 1,
        startAt: new Date('2026-12-05T04:00:00Z'),
        endAt: new Date('2026-12-05T05:00:00Z'),
      }),
      meeting({ organizerId: 'c', organizerNameBn: 'গ' }),
    ];
    const office = officeBreakdown(list);
    expect(office.totalMeetings).toBe(5);
    expect(office.byWing.map((w) => [w.nameBn, w.meetings])).toEqual([
      ['কম্পিউটার উইং', 3],
      [NO_WING_BN, 2],
    ]);
    expect(
      office.byDesignation.map((d) => [d.nameBn, d.priority, d.meetings]),
    ).toEqual([
      ['সচিব', 1, 2],
      ['উপপরিচালক', 6, 3],
    ]);
    expect(office.topOrganizers.map((o) => [o.userId, o.meetings])).toEqual([
      ['a', 2],
      ['b', 2],
      ['c', 1],
    ]);
    expect(office.busiestDays[0]).toEqual({
      date: '2026-12-01',
      meetings: 4,
      hours: 6,
    });
  });

  it('top organizers are capped at 10', () => {
    const list = Array.from({ length: 15 }, (_, i) =>
      meeting({ organizerId: `o${i}`, organizerNameBn: `নাম ${i}` }),
    );
    expect(officeBreakdown(list).topOrganizers).toHaveLength(10);
  });
});
