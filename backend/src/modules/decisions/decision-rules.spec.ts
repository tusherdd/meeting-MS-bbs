import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';
import {
  canDeleteDecisionFile,
  canViewDecisions,
  decisionStatus,
  DecisionStatus,
  MAX_DECISION_FILE_BYTES,
  MAX_DECISION_FILES,
  uploadBlock,
  uploadNoticeRecipients,
  type DecisionViewer,
} from './decision-rules';

const now = new Date('2026-11-17T06:00:00Z');
const started = {
  status: MeetingStatus.SCHEDULED,
  startAt: new Date('2026-11-17T05:00:00Z'),
};
const future = {
  status: MeetingStatus.SCHEDULED,
  startAt: new Date('2026-11-18T05:00:00Z'),
};
const cancelled = { ...started, status: MeetingStatus.CANCELLED };
const completed = { ...future, status: MeetingStatus.COMPLETED };

const as = (
  role: ParticipantRole | null,
  isAdmin = false,
  id = 'me',
): DecisionViewer => ({
  id,
  role,
  isAdmin,
});

describe('decision status (derived)', () => {
  it('Complete = at least one file', () => {
    expect(decisionStatus(started, 1, now)).toBe(DecisionStatus.COMPLETE);
    expect(decisionStatus(completed, 3, now)).toBe(DecisionStatus.COMPLETE);
  });
  it('Pending = started or completed, not cancelled, no files', () => {
    expect(decisionStatus(started, 0, now)).toBe(DecisionStatus.PENDING);
    expect(decisionStatus(completed, 0, now)).toBe(DecisionStatus.PENDING);
  });
  it('no status for cancelled or not-started meetings', () => {
    expect(decisionStatus(cancelled, 0, now)).toBeNull();
    expect(decisionStatus(cancelled, 2, now)).toBeNull();
    expect(decisionStatus(future, 0, now)).toBeNull();
  });
  it('delete-last → Pending again', () => {
    expect(decisionStatus(started, 1, now)).toBe(DecisionStatus.COMPLETE);
    expect(decisionStatus(started, 0, now)).toBe(DecisionStatus.PENDING);
  });
});

describe('limits', () => {
  it('10 MB per file, 10 files per meeting', () => {
    expect(MAX_DECISION_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_DECISION_FILES).toBe(10);
    expect(
      uploadBlock(started, as(ParticipantRole.MEMBER), 9, 1, now),
    ).toBeNull();
    expect(uploadBlock(started, as(ParticipantRole.MEMBER), 10, 1, now)).toBe(
      'tooMany',
    );
    expect(uploadBlock(started, as(ParticipantRole.MEMBER), 8, 3, now)).toBe(
      'tooMany',
    );
  });
});

describe('permissions', () => {
  it('organizer, chair and members upload; admins and outsiders do not', () => {
    for (const role of [
      ParticipantRole.ORGANIZER,
      ParticipantRole.CHAIR,
      ParticipantRole.MEMBER,
    ])
      expect(uploadBlock(started, as(role), 0, 1, now)).toBeNull();
    expect(uploadBlock(started, as(null, true), 0, 1, now)).toBe('forbidden');
    expect(uploadBlock(started, as(null), 0, 1, now)).toBe('forbidden');
  });
  it('no upload before the start or for cancelled meetings', () => {
    expect(uploadBlock(future, as(ParticipantRole.ORGANIZER), 0, 1, now)).toBe(
      'notStarted',
    );
    expect(
      uploadBlock(cancelled, as(ParticipantRole.ORGANIZER), 0, 1, now),
    ).toBe('cancelled');
    // A meeting marked completed early may receive files.
    expect(
      uploadBlock(completed, as(ParticipantRole.MEMBER), 0, 1, now),
    ).toBeNull();
  });
  it('view: the meeting’s people and admins', () => {
    expect(canViewDecisions(as(ParticipantRole.MEMBER))).toBe(true);
    expect(canViewDecisions(as(null, true))).toBe(true);
    expect(canViewDecisions(as(null))).toBe(false);
  });
  it('delete: uploader, organizer or chair — not another member, not an admin as such', () => {
    const file = { uploadedById: 'uploader' };
    expect(
      canDeleteDecisionFile(
        as(ParticipantRole.MEMBER, false, 'uploader'),
        file,
      ),
    ).toBe(true);
    expect(canDeleteDecisionFile(as(ParticipantRole.ORGANIZER), file)).toBe(
      true,
    );
    expect(canDeleteDecisionFile(as(ParticipantRole.CHAIR), file)).toBe(true);
    expect(canDeleteDecisionFile(as(ParticipantRole.MEMBER), file)).toBe(false);
    expect(canDeleteDecisionFile(as(null, true), file)).toBe(false);
  });
});

describe('upload notice recipients', () => {
  it('organizer and chair, never the uploader, no duplicates', () => {
    expect(
      uploadNoticeRecipients({ organizerId: 'o', chairId: 'c' }, 'm'),
    ).toEqual(['o', 'c']);
    expect(
      uploadNoticeRecipients({ organizerId: 'o', chairId: 'c' }, 'o'),
    ).toEqual(['c']);
    expect(
      uploadNoticeRecipients({ organizerId: 'o', chairId: null }, 'm'),
    ).toEqual(['o']);
    expect(
      uploadNoticeRecipients({ organizerId: 'o', chairId: 'o' }, 'm'),
    ).toEqual(['o']);
  });
});
