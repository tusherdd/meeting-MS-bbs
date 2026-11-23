/**
 * "অন্যান্য সংযুক্তি" / other attachments (v1.17, SPEC.md §6.11): permissions and limits as pure
 * functions, unit-tested without a database. Same file rules and permissions as the notice (§6.8).
 */
import {
  canViewNotice,
  noticeChangeBlock,
  type NoticeMeeting,
  type NoticeViewer,
} from '../notices/notice-rules';

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_FILE_MB = 10;
export const MAX_ATTACHMENT_FILE_BYTES = MAX_ATTACHMENT_FILE_MB * 1024 * 1024;
export const MAX_ATTACHMENT_NAME = 150;

/** Why an add or remove is refused (null = allowed). */
export type AttachmentBlock = 'forbidden' | 'cancelled';

/**
 * Add and remove: ONLY the meeting's organizer — not the chair, not admins (unless they organize
 * it themselves); never on a cancelled meeting.
 */
export function attachmentChangeBlock(
  meeting: NoticeMeeting,
  actorId: string,
): AttachmentBlock | null {
  return noticeChangeBlock(meeting, actorId);
}

export function canChangeAttachments(
  meeting: NoticeMeeting,
  actorId: string,
): boolean {
  return attachmentChangeBlock(meeting, actorId) === null;
}

/** Viewing: the same people who can view the notice (its people and admins). */
export function canViewAttachments(viewer: NoticeViewer): boolean {
  return canViewNotice(viewer);
}

/** One more file still fits? */
export function attachmentLimitReached(count: number): boolean {
  return count >= MAX_ATTACHMENTS;
}
