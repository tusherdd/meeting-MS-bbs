import { MeetingStatus } from './enums/meeting-status.enum';
import {
  candidateIsLower,
  classifyClashes,
  conflictNoticeRecipients,
  findClashes,
  lockOrder,
  meetingPeople,
  meetingPriority,
  organizerIsBusy,
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
    organizerId: 'e-organizer',
    chairId: null,
    peopleIds: ['e-organizer', 'shared-officer'],
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
    organizerId: 'n-organizer',
    peopleIds: ['n-organizer', 'shared-officer'],
    ...overrides,
  };
}

/** Full engine decision for one candidate against existing meetings. */
function decide(
  c: CandidateMeeting,
  list: ExistingMeeting[],
  checkOrganizer = true,
) {
  const { warnings, blocking } = classifyClashes(
    c.organizerId,
    findClashes(c, list),
    checkOrganizer,
  );
  return {
    saved: blocking.length === 0,
    conflictRows:
      blocking.length === 0
        ? warnings.flatMap((x) =>
            x.sharedPeopleIds.map((u) => `${x.meeting.id}:${u}`),
          )
        : [],
    blockingIds: blocking.map((b) => b.meeting.id),
    warningIds: warnings.map((w) => w.meeting.id),
  };
}

describe('conflict engine rule table (SPEC.md §6.4, v1.12: warn, do not block)', () => {
  it.each([
    // [case, candidate priority, existing priority]
    ['N higher (1 vs 7)', 1, 7],
    ['N higher by one (6 vs 7)', 6, 7],
    ['equal priority (6 vs 6)', 6, 6],
    ['N lower (7 vs 1)', 7, 1],
  ])(
    'shared officer, %s → warning only, saved, duplicate-meeting row',
    (_label, nPriority, ePriority) => {
      const result = decide(candidate({ priority: nPriority }), [
        existing({ priority: ePriority }),
      ]);
      expect(result).toEqual({
        saved: true,
        conflictRows: ['E:shared-officer'],
        blockingIds: [],
        warningIds: ['E'],
      });
    },
  );

  it('organizer-organizer: N organizer also organizes E → blocked, whatever the priority', () => {
    for (const [n, e] of [
      [1, 7],
      [7, 1],
      [5, 5],
    ]) {
      const result = decide(
        candidate({ priority: n, peopleIds: ['n-organizer'] }),
        [
          existing({
            priority: e,
            organizerId: 'n-organizer',
            peopleIds: ['n-organizer'],
          }),
        ],
      );
      expect(result.blockingIds).toEqual(['E']);
      expect(result.saved).toBe(false);
    }
  });

  it('organizer-chair: N organizer is the internal chair of E → blocked', () => {
    const result = decide(candidate({ priority: 1 }), [
      existing({
        priority: 9,
        chairId: 'n-organizer',
        peopleIds: ['e-organizer', 'n-organizer'],
      }),
    ]);
    expect(result).toMatchObject({ saved: false, blockingIds: ['E'] });
  });

  it('organizer-member: N organizer is only a member of E → warning only', () => {
    const result = decide(candidate({ priority: 9 }), [
      existing({ priority: 1, peopleIds: ['e-organizer', 'n-organizer'] }),
    ]);
    expect(result).toEqual({
      saved: true,
      conflictRows: ['E:n-organizer'],
      blockingIds: [],
      warningIds: ['E'],
    });
  });

  it('the chair or a member of N who organizes E is NOT the organizer rule → warning', () => {
    const result = decide(
      candidate({ peopleIds: ['n-organizer', 'chair-person'] }),
      [
        existing({
          organizerId: 'chair-person',
          chairId: 'chair-person',
          peopleIds: ['chair-person'],
        }),
      ],
    );
    expect(result).toMatchObject({ saved: true, warningIds: ['E'] });
  });

  it('edit without a new time (checkOrganizer = false) never blocks', () => {
    const result = decide(
      candidate({ id: 'N' }),
      [existing({ organizerId: 'n-organizer', peopleIds: ['n-organizer'] })],
      false,
    );
    expect(result).toMatchObject({ saved: true, warningIds: ['E'] });
  });

  it('mixed case: one warning + one organizer clash → 409 and NOTHING saved', () => {
    const result = decide(candidate({ priority: 5 }), [
      existing({ id: 'warn', priority: 1 }),
      existing({ id: 'own', organizerId: 'n-organizer' }),
    ]);
    expect(result).toEqual({
      saved: false,
      conflictRows: [],
      blockingIds: ['own'],
      warningIds: ['warn'],
    });
  });

  it('organizerIsBusy: organizer or internal chair only', () => {
    expect(organizerIsBusy('x', { organizerId: 'x', chairId: null })).toBe(
      true,
    );
    expect(organizerIsBusy('x', { organizerId: 'y', chairId: 'x' })).toBe(true);
    expect(organizerIsBusy('x', { organizerId: 'y', chairId: 'z' })).toBe(
      false,
    );
  });

  it('no shared person → no clash at all', () => {
    const result = decide(
      candidate({ priority: 9, peopleIds: ['someone-else'] }),
      [existing()],
    );
    expect(result).toEqual({
      saved: true,
      conflictRows: [],
      blockingIds: [],
      warningIds: [],
    });
  });

  it('touching times (10:00–11:00 and 11:00–12:00) do not clash', () => {
    const result = decide(
      candidate({ priority: 9, startAt: at('11:00'), endAt: at('12:00') }),
      [existing()],
    );
    expect(result.warningIds).toEqual([]);
    const before = decide(
      candidate({ priority: 9, startAt: at('09:00'), endAt: at('10:00') }),
      [existing()],
    );
    expect(before.warningIds).toEqual([]);
  });

  it.each([MeetingStatus.CANCELLED, MeetingStatus.COMPLETED])(
    '%s meetings are ignored',
    (status) => {
      const result = decide(candidate({ priority: 9 }), [
        existing({ status, organizerId: 'n-organizer' }),
      ]);
      expect(result.blockingIds).toEqual([]);
      expect(result.warningIds).toEqual([]);
    },
  );

  it('the chair counts as a person of the meeting', () => {
    const people = meetingPeople('organizer', 'chair-person', ['member']);
    expect(people).toEqual(['organizer', 'chair-person', 'member']);
    const result = decide(
      candidate({ priority: 9, organizerId: 'organizer', peopleIds: people }),
      [existing({ peopleIds: ['chair-person'] })],
    );
    expect(result.warningIds).toEqual(['E']);
  });

  it('the organizer counts too, and people are deduplicated', () => {
    expect(meetingPeople('a', 'a', ['a', 'b', 'b'])).toEqual(['a', 'b']);
    expect(meetingPeople('a', null, [])).toEqual(['a']);
  });

  it('on update the meeting never clashes with itself', () => {
    const self = existing({ id: 'N', organizerId: 'n-organizer' });
    expect(decide(candidate({ id: 'N' }), [self])).toMatchObject({
      blockingIds: [],
      warningIds: [],
    });
    // ...but it still clashes with others
    expect(
      decide(candidate({ id: 'N' }), [self, existing({ id: 'X' })]).warningIds,
    ).toEqual(['X']);
  });

  it('one conflict row per (other meeting, shared officer)', () => {
    const result = decide(
      candidate({ priority: 1, peopleIds: ['n-organizer', 'a', 'b', 'c'] }),
      [
        existing({ id: 'E1', peopleIds: ['a', 'b'] }),
        existing({ id: 'E2', peopleIds: ['c', 'z'] }),
      ],
    );
    expect(result.conflictRows).toEqual(['E1:a', 'E1:b', 'E2:c']);
  });
});

describe('candidateIsLower (record orientation, v1.12)', () => {
  it('smaller number is higher; on equal priority the new/moved meeting is lower', () => {
    expect(candidateIsLower(1, 7)).toBe(false);
    expect(candidateIsLower(7, 1)).toBe(true);
    expect(candidateIsLower(5, 5)).toBe(true);
  });
});

describe('conflictNoticeRecipients (SPEC.md §6.4, v1.12)', () => {
  const base = {
    candidateOrganizerId: 'n-org',
    existingOrganizerId: 'e-org',
    freshSharedIds: ['shared'],
  };

  it('N higher → only E (lower) organizer + shared officer', () => {
    expect(
      conflictNoticeRecipients({
        ...base,
        candidatePriority: 1,
        existingPriority: 7,
      }),
    ).toEqual([
      { userId: 'e-org', side: 'EXISTING' },
      { userId: 'shared', side: 'EXISTING' },
    ]);
  });

  it('N lower → only N (lower) organizer + shared officer', () => {
    expect(
      conflictNoticeRecipients({
        ...base,
        candidatePriority: 7,
        existingPriority: 1,
      }),
    ).toEqual([
      { userId: 'n-org', side: 'CANDIDATE' },
      { userId: 'shared', side: 'CANDIDATE' },
    ]);
  });

  it('equal priority → BOTH organizers, each about their own meeting', () => {
    expect(
      conflictNoticeRecipients({
        ...base,
        candidatePriority: 5,
        existingPriority: 5,
      }),
    ).toEqual([
      { userId: 'e-org', side: 'EXISTING' },
      { userId: 'n-org', side: 'CANDIDATE' },
      { userId: 'shared', side: 'CANDIDATE' },
    ]);
  });

  it('shared officer notified once, even with several roles or listed twice', () => {
    const list = conflictNoticeRecipients({
      candidateOrganizerId: 'n-org',
      existingOrganizerId: 'e-org',
      freshSharedIds: ['e-org', 'x', 'x', 'n-org'],
      candidatePriority: 5,
      existingPriority: 5,
    });
    expect(list.map((r) => r.userId).sort()).toEqual(['e-org', 'n-org', 'x']);
    // an organizer who is also shared reads about their OWN meeting
    expect(list.find((r) => r.userId === 'e-org')!.side).toBe('EXISTING');
    expect(list.find((r) => r.userId === 'n-org')!.side).toBe('CANDIDATE');
  });

  it('no fresh shared officer → organizers only', () => {
    expect(
      conflictNoticeRecipients({
        ...base,
        freshSharedIds: [],
        candidatePriority: 1,
        existingPriority: 7,
      }),
    ).toEqual([{ userId: 'e-org', side: 'EXISTING' }]);
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

describe('meetingPriority (SPEC.md §6.3, v1.5: priority comes from the chair)', () => {
  it.each([
    ['internal chair with a higher priority', 6, { priority: 1 }, 1],
    ['internal chair with a lower priority', 2, { priority: 7 }, 7],
    ['internal chair with the same priority', 6, { priority: 6 }, 6],
    ['guest chair or no chair → organizer', 6, null, 6],
  ])('%s', (_case, organizer, chair, expected) => {
    expect(meetingPriority(organizer, chair)).toBe(expected);
  });
});
