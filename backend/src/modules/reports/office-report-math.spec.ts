import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole as R } from '../meetings/enums/participant-role.enum';
import {
  busiestDays,
  chairOptions,
  filterMeetings,
  officeCards,
  organizerWingOptions,
  roleOf,
  topParticipants,
  wingRows,
  type OfficeMeeting,
  type OfficePerson,
} from './office-report-math';
import { NO_WING_BN } from './report-math';

const person = (
  userId: string,
  role: R,
  wingId: string | null = 'w1',
): OfficePerson => ({
  userId,
  role,
  nameBn: `নাম ${userId}`,
  nameEn: `Name ${userId}`,
  designationBn: 'পরিচালক',
  designationEn: 'Director',
  wingId,
  wingBn: wingId ? `উইং ${wingId}` : null,
  wingEn: wingId ? `Wing ${wingId}` : null,
});

let n = 0;
function meeting(overrides: Partial<OfficeMeeting> = {}): OfficeMeeting {
  n++;
  return {
    id: `m${n}`,
    title: `সভা ${n}`,
    // 10:00–11:00 Dhaka on 1 Dec 2026
    startAt: new Date('2026-12-01T04:00:00Z'),
    endAt: new Date('2026-12-01T05:00:00Z'),
    room: null,
    status: MeetingStatus.COMPLETED,
    organizerId: 'org',
    organizerNameBn: 'আয়োজক',
    organizerNameEn: 'Organizer',
    organizerDesignationId: 'dir',
    organizerDesignationBn: 'পরিচালক',
    organizerDesignationEn: 'Director',
    organizerDesignationPriority: 4,
    organizerWingId: 'w1',
    organizerWingBn: 'উইং w1',
    organizerWingEn: 'Wing w1',
    myRole: null,
    chairId: null,
    chairNameBn: null,
    chairNameEn: null,
    chairDesignationBn: null,
    chairDesignationEn: null,
    chairKey: null,
    guests: [],
    people: [person('org', R.ORGANIZER)],
    ...overrides,
  };
}

describe('office report math (v1.15)', () => {
  it('cards: every status counted, hours without cancelled meetings', () => {
    const list = [
      meeting(),
      meeting({ status: MeetingStatus.SCHEDULED }),
      meeting({ status: MeetingStatus.CANCELLED }),
    ];
    expect(officeCards(list)).toEqual({
      total: 3,
      scheduled: 1,
      completed: 1,
      cancelled: 1,
      hours: 2,
    });
  });

  it('wing list counts by the ORGANIZER’s wing (members of other wings do not count there)', () => {
    const list = [
      meeting({
        people: [person('org', R.ORGANIZER), person('x', R.MEMBER, 'w2')],
      }),
      meeting(),
      meeting({ status: MeetingStatus.CANCELLED }),
      meeting({
        organizerWingId: 'w2',
        organizerWingBn: 'উইং w2',
        status: MeetingStatus.SCHEDULED,
      }),
      meeting({ organizerWingId: null, organizerWingBn: null }),
    ];
    expect(
      wingRows(list).map((w) => [
        w.nameBn,
        w.meetings,
        w.completed,
        w.cancelled,
        w.hours,
      ]),
    ).toEqual([
      ['উইং w1', 3, 2, 1, 2],
      ['উইং w2', 1, 0, 0, 1],
      [NO_WING_BN, 1, 1, 0, 1],
    ]);
  });

  it('top 5 participants count every role, skip cancelled meetings, are capped at 5', () => {
    const list = [
      meeting({
        people: [
          person('a', R.ORGANIZER),
          person('b', R.CHAIR),
          person('c', R.MEMBER),
        ],
      }),
      meeting({ people: [person('b', R.ORGANIZER), person('c', R.MEMBER)] }),
      meeting({ people: [person('c', R.CHAIR)] }),
      meeting({
        status: MeetingStatus.CANCELLED,
        people: [person('a', R.ORGANIZER), person('a', R.MEMBER)],
      }),
      ...['d', 'e', 'f', 'g'].map((id) =>
        meeting({ people: [person(id, R.MEMBER)] }),
      ),
    ];
    const top = topParticipants(list);
    expect(top).toHaveLength(5);
    expect(top.slice(0, 3).map((p) => [p.userId, p.meetings, p.hours])).toEqual(
      [
        ['c', 3, 3],
        ['b', 2, 2],
        ['a', 1, 1],
      ],
    );
  });

  it('top 5 of one wing only (WING viewers)', () => {
    const list = [
      meeting({
        people: [person('a', R.ORGANIZER, 'w1'), person('z', R.MEMBER, 'w2')],
      }),
      meeting({ people: [person('z', R.MEMBER, 'w2')] }),
    ];
    expect(topParticipants(list, 'w1').map((p) => p.userId)).toEqual(['a']);
    expect(topParticipants(list).map((p) => p.userId)).toEqual(['z', 'a']);
  });

  it('busiest days keep the old rule (most meetings first)', () => {
    const list = [
      meeting(),
      meeting({
        startAt: new Date('2026-12-02T04:00:00Z'),
        endAt: new Date('2026-12-02T05:00:00Z'),
      }),
      meeting({
        startAt: new Date('2026-12-02T06:00:00Z'),
        endAt: new Date('2026-12-02T07:00:00Z'),
      }),
    ];
    expect(busiestDays(list).map((d) => [d.date, d.meetings])).toEqual([
      ['2026-12-02', 2],
      ['2026-12-01', 1],
    ]);
  });

  it('role of an officer; list filters (status, organizer wing, chair, role)', () => {
    const m1 = meeting({
      chairId: 'b',
      chairKey: 'user:b',
      chairNameBn: 'খ',
      people: [
        person('org', R.ORGANIZER),
        person('b', R.CHAIR),
        person('c', R.MEMBER),
      ],
    });
    const m2 = meeting({
      status: MeetingStatus.CANCELLED,
      organizerWingId: 'w2',
      chairKey: 'guest:অতিথি',
      chairNameBn: 'অতিথি',
      people: [person('org', R.ORGANIZER), person('b', R.MEMBER)],
    });
    expect(roleOf(m1, 'org')).toBe(R.ORGANIZER);
    expect(roleOf(m1, 'b')).toBe(R.CHAIR);
    expect(roleOf(m1, 'c')).toBe(R.MEMBER);
    expect(roleOf(m1, 'nobody')).toBeNull();

    const ids = (l: OfficeMeeting[]) => l.map((m) => m.id);
    expect(
      ids(filterMeetings([m1, m2], { status: MeetingStatus.CANCELLED }, null)),
    ).toEqual([m2.id]);
    expect(
      ids(filterMeetings([m1, m2], { organizerWingId: 'w2' }, null)),
    ).toEqual([m2.id]);
    expect(ids(filterMeetings([m1, m2], { chair: 'user:b' }, null))).toEqual([
      m1.id,
    ]);
    expect(ids(filterMeetings([m1, m2], { role: R.MEMBER }, 'b'))).toEqual([
      m2.id,
    ]);
    // The role filter needs an officer.
    expect(
      ids(filterMeetings([m1, m2], { role: R.MEMBER }, null)),
    ).toHaveLength(2);

    expect(chairOptions([m1, m2, m1]).map((c) => c.key)).toEqual([
      'guest:অতিথি',
      'user:b',
    ]);
    expect(organizerWingOptions([m1, m2]).map((w) => w.id)).toEqual([
      'w1',
      'w2',
    ]);
  });
});
