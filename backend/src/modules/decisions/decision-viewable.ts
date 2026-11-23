import { In, type EntityManager } from 'typeorm';
import { MeetingDecisionFile } from './entities/meeting-decision-file.entity';

/** The minutes types the file viewer panel can show (PDF and images); a DOCX is only downloaded. */
export const VIEWABLE_DECISION_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

/**
 * v1.17 (SPEC.md §13.18): the meetings among `meetingIds` with at least one minutes file that the
 * panel can show. The row menu then says "কার্যবিবরণী দেখুন"; with files but none of them viewable
 * (DOCX only) it says "কার্যবিবরণী ডাউনলোড". One query for all ids.
 */
export async function decisionViewableIds(
  manager: EntityManager,
  meetingIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(meetingIds)];
  if (ids.length === 0) return new Set();
  const rows = await manager.getRepository(MeetingDecisionFile).find({
    select: { meetingId: true },
    where: { meetingId: In(ids), mime: In([...VIEWABLE_DECISION_MIMES]) },
  });
  return new Set(rows.map((r) => r.meetingId));
}
