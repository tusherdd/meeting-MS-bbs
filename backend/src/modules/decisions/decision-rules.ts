/**
 * Meeting decisions ("সভা সিদ্ধান্ত", v1.11, SPEC.md §6.9): status and permissions as pure
 * functions, so every rule is unit-tested without a database.
 */
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';

export const MAX_DECISION_FILE_MB = 10;
export const MAX_DECISION_FILE_BYTES = MAX_DECISION_FILE_MB * 1024 * 1024;
export const MAX_DECISION_FILES = 10;

export enum DecisionStatus {
  PENDING = 'PENDING',
  COMPLETE = 'COMPLETE',
}

export interface DecisionMeeting {
  status: MeetingStatus;
  startAt: Date;
}

/**
 * Derived, never stored:
 * - cancelled meetings have no decision status (null), files or not;
 * - at least one file → COMPLETE;
 * - started (or completed) and no file → PENDING;
 * - not started yet → null.
 */
export function decisionStatus(
  meeting: DecisionMeeting,
  fileCount: number,
  now = new Date(),
): DecisionStatus | null {
  if (meeting.status === MeetingStatus.CANCELLED) return null;
  if (fileCount > 0) return DecisionStatus.COMPLETE;
  if (
    meeting.status === MeetingStatus.COMPLETED ||
    meeting.startAt.getTime() <= now.getTime()
  )
    return DecisionStatus.PENDING;
  return null;
}

export interface DecisionViewer {
  id: string;
  isAdmin: boolean;
  /** The viewer's role in the meeting (organizer, internal chair, member); null = not invited. */
  role: ParticipantRole | null;
}

/** Why an upload is refused (null = allowed). */
export type UploadBlock = 'forbidden' | 'cancelled' | 'notStarted' | 'tooMany';

export function uploadBlock(
  meeting: DecisionMeeting,
  viewer: DecisionViewer,
  existingFiles: number,
  newFiles = 1,
  now = new Date(),
): UploadBlock | null {
  // Organizer, internal chair and members upload; admins only view and download.
  if (!viewer.role) return 'forbidden';
  if (meeting.status === MeetingStatus.CANCELLED) return 'cancelled';
  if (
    meeting.status !== MeetingStatus.COMPLETED &&
    now.getTime() < meeting.startAt.getTime()
  )
    return 'notStarted';
  if (existingFiles + newFiles > MAX_DECISION_FILES) return 'tooMany';
  return null;
}

/** View and download: the meeting's people and admins. */
export function canViewDecisions(viewer: DecisionViewer): boolean {
  return viewer.isAdmin || viewer.role !== null;
}

/** Delete: the uploader, the organizer or the internal chair (not admins as such). */
export function canDeleteDecisionFile(
  viewer: DecisionViewer,
  file: { uploadedById: string },
): boolean {
  return (
    file.uploadedById === viewer.id ||
    viewer.role === ParticipantRole.ORGANIZER ||
    viewer.role === ParticipantRole.CHAIR
  );
}

/** Who gets the bell notice after an upload: organizer and internal chair, never the uploader. */
export function uploadNoticeRecipients(
  meeting: { organizerId: string; chairId: string | null },
  uploaderId: string,
): string[] {
  return [
    ...new Set([meeting.organizerId, meeting.chairId].filter(Boolean)),
  ].filter((id): id is string => !!id && id !== uploaderId);
}
