import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';
import {
  byDay,
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
    organizerNameEn: 'Me',
    organizerDesignationId: 'dd',
    organizerDesignationBn: 'উপপরিচালক',
    organizerDesignationEn: 'Deputy Director',
    organizerDesignationPriority: 6,
    organizerWingId: 'w1',
    organizerWingBn: 'কম্পিউটার উইং',
    organizerWingEn: 'Computer Wing',
    myRole: ParticipantRole.ORGANIZER,
    chairNameBn: null,
    chairNameEn: null,
    guests: [],
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

  it('guest officers are listed only: they change no count (v1.5)', () => {
    const plain = [meeting(), meeting({ organizerId: 'other' })];
    const withGuests = plain.map((m) => ({
      ...m,
      guests: [
        { name: 'অতিথি এক', designation: 'যুগ্মসচিব' },
        { name: 'অতিথি দুই', designation: 'পরামর্শক' },
      ],
    }));
    const conflicts = { againstMine: 0, raisedByMe: 0 };
    expect(personalSummary(withGuests, 'me', conflicts)).toEqual(
      personalSummary(plain, 'me', conflicts),
    );
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
});
