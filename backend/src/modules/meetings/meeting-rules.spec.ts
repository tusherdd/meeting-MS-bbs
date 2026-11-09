import { MeetingStatus } from './enums/meeting-status.enum';
import {
  classifyClashes,
  findClashes,
  lockOrder,
  meetingPeople,
  overlaps,
  timeProblems,
  type CandidateMeeting,
  type ExistingMeeting,
} from './meeting-rules';

const at = (hhmm: string) => new Date(`2026-12-01T${hhmm}:00+06:00`);

function existing(overrides: Partial<ExistingMeeting> = {}): ExistingMeeting {
  return {
    id: 'E',
    status: MeetingStatus.SCHEDULED,
    priority: 7,
    startAt: at('10:00'),
    endAt: at('11:00'),
    peopleIds: ['so-organizer', 'shared-officer'],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<CandidateMeeting> = {},
): CandidateMeeting {
  return {
    priority: 1,
    startAt: at('10:30'),
    endAt: at('11:30'),
    peopleIds: ['secretary', 'shared-officer'],
    ...overrides,
  };
}

/** Full engine decision for one candidate against existing meetings. */
function decide(c: CandidateMeeting, list: ExistingMeeting[]) {
  const { allowed, blocking } = classifyClashes(
    c.priority,
    findClashes(c, list),
  );
  return {
    saved: blocking.length === 0,
    conflictRows:
      blocking.length === 0
        ? allowed.flatMap((x) =>
            x.sharedPeopleIds.map((u) => `${x.meeting.id}:${u}`),
          )
        : [],
    blockingIds: blocking.map((b) => b.meeting.id),
  };
}

describe('conflict engine rule table (SPEC.md §6.4)', () => {
  it.each([
    // [case, candidate priority, existing priority, saved?]
    ['N higher (1 vs 7) → saved, conflict row', 1, 7, true],
    ['N higher by one (6 vs 7) → saved', 6, 7, true],
    ['equal priority (6 vs 6) → 409', 6, 6, false],
    ['N lower (7 vs 1) → 409', 7, 1, false],
  ])('%s', (_label, nPriority, ePriority, saved) => {
    const result = decide(candidate({ priority: nPriority }), [
      existing({ priority: ePriority }),
    ]);
    expect(result.saved).toBe(saved);
    expect(result.conflictRows).toEqual(saved ? ['E:shared-officer'] : []);
    expect(result.blockingIds).toEqual(saved ? [] : ['E']);
  });

  it('no shared person → no clash at all, even with lower priority', () => {
    const result = decide(
      candidate({ priority: 9, peopleIds: ['someone-else'] }),
      [existing()],
    );
    expect(result).toEqual({ saved: true, conflictRows: [], blockingIds: [] });
  });

  it('touching times (10:00–11:00 and 11:00–12:00) do not clash', () => {
    const result = decide(
      candidate({ priority: 9, startAt: at('11:00'), endAt: at('12:00') }),
      [existing()],
    );
    expect(result.blockingIds).toEqual([]);
    const before = decide(
      candidate({ priority: 9, startAt: at('09:00'), endAt: at('10:00') }),
      [existing()],
    );
    expect(before.blockingIds).toEqual([]);
  });

  it.each([MeetingStatus.CANCELLED, MeetingStatus.COMPLETED])(
    '%s meetings are ignored',
    (status) => {
      expect(
        decide(candidate({ priority: 9 }), [existing({ status })]).blockingIds,
      ).toEqual([]);
    },
  );

  it('the chair counts as a person of the meeting', () => {
    const people = meetingPeople('organizer', 'chair-person', ['member']);
    expect(people).toEqual(['organizer', 'chair-person', 'member']);
    const result = decide(candidate({ priority: 9, peopleIds: people }), [
      existing({ peopleIds: ['chair-person'] }),
    ]);
    expect(result.blockingIds).toEqual(['E']);
  });

  it('the organizer counts too, and people are deduplicated', () => {
    expect(meetingPeople('a', 'a', ['a', 'b', 'b'])).toEqual(['a', 'b']);
    expect(meetingPeople('a', null, [])).toEqual(['a']);
  });

  it('on update the meeting never clashes with itself', () => {
    const self = existing({ id: 'N', priority: 6 });
    expect(
      decide(candidate({ id: 'N', priority: 6 }), [self]).blockingIds,
    ).toEqual([]);
    // ...but it still clashes with others
    expect(
      decide(candidate({ id: 'N', priority: 6 }), [
        self,
        existing({ id: 'X', priority: 6 }),
      ]).blockingIds,
    ).toEqual(['X']);
  });

  it('mixed case: one allowed + one blocking → 409 and NOTHING saved (no conflict rows)', () => {
    const result = decide(candidate({ priority: 5 }), [
      existing({ id: 'lower', priority: 7 }),
      existing({ id: 'equal', priority: 5 }),
    ]);
    expect(result).toEqual({
      saved: false,
      conflictRows: [],
      blockingIds: ['equal'],
    });
  });

  it('one conflict row per (lower meeting, shared officer)', () => {
    const result = decide(
      candidate({ priority: 1, peopleIds: ['a', 'b', 'c'] }),
      [
        existing({ id: 'E1', peopleIds: ['a', 'b'] }),
        existing({ id: 'E2', peopleIds: ['c', 'z'] }),
      ],
    );
    expect(result.conflictRows).toEqual(['E1:a', 'E1:b', 'E2:c']);
  });
});

describe('overlaps', () => {
  it.each([
    ['inside', '10:15', '10:45', true],
    ['covering', '09:00', '12:00', true],
    ['starts inside', '10:59', '11:30', true],
    ['ends exactly at start', '09:00', '10:00', false],
    ['starts exactly at end', '11:00', '11:30', false],
  ])('%s', (_l, s, e, expected) => {
    expect(overlaps({ startAt: at(s), endAt: at(e) }, existing())).toBe(
      expected,
    );
  });
});

describe('timeProblems', () => {
  const now = at('09:00');
  it('accepts a normal future meeting', () => {
    expect(
      timeProblems({ startAt: at('10:00'), endAt: at('11:00') }, now, true),
    ).toEqual([]);
  });
  it('end must be after start', () => {
    expect(
      timeProblems({ startAt: at('10:00'), endAt: at('10:00') }, now, true),
    ).toEqual(['endBeforeStart']);
  });
  it('at most 12 hours', () => {
    expect(
      timeProblems(
        {
          startAt: at('08:00'),
          endAt: new Date(at('08:00').getTime() + 12 * 3_600_000 + 1),
        },
        at('07:00'),
        true,
      ),
    ).toEqual(['tooLong']);
  });
  it('start may be up to 5 minutes in the past, not more', () => {
    expect(
      timeProblems({ startAt: at('08:56'), endAt: at('10:00') }, now, true),
    ).toEqual([]);
    expect(
      timeProblems({ startAt: at('08:54'), endAt: at('10:00') }, now, true),
    ).toEqual(['inPast']);
    expect(
      timeProblems({ startAt: at('08:00'), endAt: at('10:00') }, now, false),
    ).toEqual([]);
  });
});

describe('lockOrder', () => {
  it('sorts and deduplicates so locks are always taken in the same order', () => {
    expect(lockOrder(['c', 'a', 'b', 'a'])).toEqual(['a', 'b', 'c']);
  });
});
