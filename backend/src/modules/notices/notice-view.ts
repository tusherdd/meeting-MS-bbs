import type { Meeting } from '../meetings/entities/meeting.entity';
import type { NoticeFileDto } from './dto/notice.dto';
import type { MeetingNoticeFile } from './entities/meeting-notice-file.entity';
import { canChangeNotice } from './notice-rules';

/** The notice row as an API object (also used by GET /meetings/:id). */
export function noticeDto(
  file: MeetingNoticeFile,
  meeting: Pick<Meeting, 'organizerId' | 'status'>,
  actorId: string,
): NoticeFileDto {
  return {
    originalName: file.originalName,
    mime: file.mime,
    size: file.size,
    uploadedAt: file.createdAt,
    uploadedBy: {
      id: file.uploadedBy.id,
      nameBn: file.uploadedBy.nameBn,
      nameEn: file.uploadedBy.nameEn,
    },
    canManage: canChangeNotice(meeting, actorId),
  };
}
