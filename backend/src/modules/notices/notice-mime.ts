import { In, type EntityManager } from 'typeorm';
import { MeetingNoticeFile } from './entities/meeting-notice-file.entity';

/**
 * v1.17 (SPEC.md §6.8): the mime type of each meeting's uploaded notice, so list rows can say
 * "নোটিশ দেখুন" (PDF / image, opens the file viewer) or "নোটিশ ডাউনলোড" (DOCX). One query for
 * all ids; meetings without a notice are missing from the map.
 */
export async function noticeMimes(
  manager: EntityManager,
  meetingIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(meetingIds)];
  if (ids.length === 0) return new Map();
  const rows = await manager.getRepository(MeetingNoticeFile).find({
    select: { meetingId: true, mime: true },
    where: { meetingId: In(ids) },
  });
  return new Map(rows.map((r) => [r.meetingId, r.mime]));
}
