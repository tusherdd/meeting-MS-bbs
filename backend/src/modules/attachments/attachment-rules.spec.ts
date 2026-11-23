import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import {
  attachmentChangeBlock,
  attachmentLimitReached,
  canChangeAttachments,
  canViewAttachments,
  MAX_ATTACHMENTS,
} from './attachment-rules';

const scheduled = { organizerId: 'org', status: MeetingStatus.SCHEDULED };

describe('attachment rules (SPEC.md §6.11, v1.17)', () => {
  it('ONLY the organizer may add or remove', () => {
    expect(attachmentChangeBlock(scheduled, 'org')).toBeNull();
    expect(canChangeAttachments(scheduled, 'org')).toBe(true);
    for (const other of ['chair', 'member', 'admin']) {
      expect(attachmentChangeBlock(scheduled, other)).toBe('forbidden');
      expect(canChangeAttachments(scheduled, other)).toBe(false);
    }
  });

  it('a cancelled meeting is frozen; a completed one is not', () => {
    expect(
      attachmentChangeBlock(
        { ...scheduled, status: MeetingStatus.CANCELLED },
        'org',
      ),
    ).toBe('cancelled');
    expect(
      attachmentChangeBlock(
        { ...scheduled, status: MeetingStatus.COMPLETED },
        'org',
      ),
    ).toBeNull();
  });

  it('viewing: the meeting’s people and admins (like the notice)', () => {
    expect(
      canViewAttachments({ id: 'a', isAdmin: true, isPerson: false }),
    ).toBe(true);
    expect(
      canViewAttachments({ id: 'p', isAdmin: false, isPerson: true }),
    ).toBe(true);
    expect(
      canViewAttachments({ id: 's', isAdmin: false, isPerson: false }),
    ).toBe(false);
  });

  it('at most 5 per meeting', () => {
    expect(MAX_ATTACHMENTS).toBe(5);
    expect(attachmentLimitReached(4)).toBe(false);
    expect(attachmentLimitReached(5)).toBe(true);
  });
});
