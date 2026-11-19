/**
 * The uploaded meeting notice "সভার নোটিশ" (v1.13, SPEC.md §6.8): permissions as pure functions,
 * unit-tested without a database.
 */
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';

export const MAX_NOTICE_FILE_MB = 10;
export const MAX_NOTICE_FILE_BYTES = MAX_NOTICE_FILE_MB * 1024 * 1024;

export interface NoticeMeeting {
  organizerId: string;
  status: MeetingStatus;
}

export interface NoticeViewer {
  id: string;
  isAdmin: boolean;
  /** One of the meeting's people (organizer, internal chair, member). */
  isPerson: boolean;
}

/** Why an upload, replace or remove is refused (null = allowed). */
export type NoticeBlock = 'forbidden' | 'cancelled';

/**
 * Upload, replace and remove: ONLY the meeting's organizer — not the chair, not admins (unless
 * they organize it themselves). A cancelled meeting is frozen: its notice stays as it is.
 */
export function noticeChangeBlock(
  meeting: NoticeMeeting,
  actorId: string,
): NoticeBlock | null {
  if (meeting.organizerId !== actorId) return 'forbidden';
  if (meeting.status === MeetingStatus.CANCELLED) return 'cancelled';
  return null;
}

/** May this viewer change the notice (used for `canManage` in responses)? */
export function canChangeNotice(
  meeting: NoticeMeeting,
  actorId: string,
): boolean {
  return noticeChangeBlock(meeting, actorId) === null;
}

/** Download: everyone who can view the meeting (its people and admins), also when cancelled. */
export function canViewNotice(viewer: NoticeViewer): boolean {
  return viewer.isAdmin || viewer.isPerson;
}
