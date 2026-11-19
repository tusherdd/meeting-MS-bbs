import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import {
  canChangeNotice,
  canViewNotice,
  noticeChangeBlock,
} from './notice-rules';

const scheduled = { organizerId: 'org', status: MeetingStatus.SCHEDULED };

describe('notice rules (SPEC.md §6.8, v1.13)', () => {
  it('ONLY the organizer may upload, replace or remove', () => {
    expect(noticeChangeBlock(scheduled, 'org')).toBeNull();
    expect(canChangeNotice(scheduled, 'org')).toBe(true);
    // the chair, a member, an admin (who does not organize it) — all refused
    for (const other of ['chair', 'member', 'admin']) {
      expect(noticeChangeBlock(scheduled, other)).toBe('forbidden');
      expect(canChangeNotice(scheduled, other)).toBe(false);
    }
  });

  it('a completed meeting may still get a notice; a cancelled one is frozen', () => {
    expect(
      noticeChangeBlock(
        { ...scheduled, status: MeetingStatus.COMPLETED },
        'org',
      ),
    ).toBeNull();
    expect(
      noticeChangeBlock(
        { ...scheduled, status: MeetingStatus.CANCELLED },
        'org',
      ),
    ).toBe('cancelled');
    // not the organizer → forbidden first, whatever the status
    expect(
      noticeChangeBlock({ ...scheduled, status: MeetingStatus.CANCELLED }, 'x'),
    ).toBe('forbidden');
  });

  it('download: the meeting’s people and admins, nobody else', () => {
    expect(canViewNotice({ id: 'm', isAdmin: false, isPerson: true })).toBe(
      true,
    );
    expect(canViewNotice({ id: 'a', isAdmin: true, isPerson: false })).toBe(
      true,
    );
    expect(canViewNotice({ id: 's', isAdmin: false, isPerson: false })).toBe(
      false,
    );
  });
});
