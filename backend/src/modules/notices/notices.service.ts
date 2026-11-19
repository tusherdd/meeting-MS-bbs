import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ReadStream } from 'node:fs';
import { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import {
  DecisionFileError,
  decodeUploadName,
  displayName,
  processDecisionFile,
  sanitizeFileName,
} from '../decisions/decision-file';
import { DecisionStorageService } from '../decisions/decision-storage.service';
import { DECISION_MESSAGES } from '../decisions/decisions.messages';
import { MeetingParticipant } from '../meetings/entities/meeting-participant.entity';
import { Meeting } from '../meetings/entities/meeting.entity';
import { MEETING_MESSAGES } from '../meetings/meetings.messages';
import { isAdmin } from '../meetings/meetings.service';
import type { NoticeFileDto } from './dto/notice.dto';
import { noticeDto } from './notice-view';
import { MeetingNoticeFile } from './entities/meeting-notice-file.entity';
import {
  canViewNotice,
  MAX_NOTICE_FILE_BYTES,
  noticeChangeBlock,
  type NoticeBlock,
} from './notice-rules';
import { NOTICE_MESSAGES as MSG } from './notices.messages';

/** What multer hands over (memory storage). */
export interface IncomingNoticeFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const AREA = 'notices' as const;

/**
 * The uploaded meeting notice "সভার নোটিশ" (v1.13, SPEC.md §6.8): one file per meeting, uploaded,
 * replaced and removed only by the organizer; downloaded by the meeting's people and admins.
 * Stored privately like the minutes (DECISION_UPLOAD_DIR/notices/<meetingId>/).
 */
@Injectable()
export class NoticesService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingNoticeFile)
    private readonly files: Repository<MeetingNoticeFile>,
    private readonly storage: DecisionStorageService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /** The meeting, if the actor may view it (its people and admins; others 403, unknown 404). */
  private async loadVisible(actor: AuthUser, id: string): Promise<Meeting> {
    const meeting = await this.meetings.findOneBy({ id });
    if (!meeting) throw new NotFoundException(MEETING_MESSAGES.notFound);
    const isPerson = await this.dataSource
      .getRepository(MeetingParticipant)
      .existsBy({ meetingId: id, userId: actor.id });
    if (!canViewNotice({ id: actor.id, isAdmin: isAdmin(actor), isPerson }))
      throw new ForbiddenException(MSG.forbidden);
    return meeting;
  }

  private assertChange(block: NoticeBlock | null): void {
    if (block === 'forbidden')
      throw new ForbiddenException(MSG.changeForbidden);
    if (block === 'cancelled') throw new ConflictException(MSG.cancelled);
  }

  private findRow(meetingId: string) {
    return this.files.findOne({
      where: { meetingId },
      relations: { uploadedBy: true },
    });
  }

  async download(
    actor: AuthUser,
    id: string,
  ): Promise<{ file: MeetingNoticeFile; stream: ReadStream }> {
    await this.loadVisible(actor, id);
    const file = await this.files.findOneBy({ meetingId: id });
    if (!file) throw new NotFoundException(MSG.notFound);
    return { file, stream: this.storage.open(id, file.storedName, AREA) };
  }

  /** Upload, or replace the existing notice. Returns the stored notice. */
  async upload(
    actor: AuthUser,
    id: string,
    incoming: IncomingNoticeFile | undefined,
    ip: string | null,
  ): Promise<NoticeFileDto> {
    const meeting = await this.loadVisible(actor, id);
    // Cheap checks first: no file is read unless the organizer may change the notice.
    this.assertChange(noticeChangeBlock(meeting, actor.id));
    if (!incoming) throw new BadRequestException(MSG.fileMissing);
    if (
      incoming.size > MAX_NOTICE_FILE_BYTES ||
      incoming.buffer.length > MAX_NOTICE_FILE_BYTES
    )
      throw new PayloadTooLargeException(MSG.tooLarge);

    const clientName = decodeUploadName(incoming.originalname);
    const shownName = displayName(clientName);
    let processed: Awaited<ReturnType<typeof processDecisionFile>>;
    try {
      processed = await processDecisionFile(incoming.buffer);
    } catch (err) {
      if (err instanceof DecisionFileError) {
        throw new BadRequestException(
          err.reason === 'type'
            ? DECISION_MESSAGES.badType(shownName)
            : err.reason === 'macro'
              ? DECISION_MESSAGES.macro(shownName)
              : DECISION_MESSAGES.unreadable(shownName),
        );
      }
      throw err;
    }
    const name = sanitizeFileName(clientName, processed.extension);

    let written: string | null = null;
    let replaced: MeetingNoticeFile | null = null;
    try {
      await this.dataSource.transaction(async (manager) => {
        // Lock the meeting row: two uploads for the same meeting run one after the other, and
        // a cancel at the same moment is seen.
        const locked = await manager
          .getRepository(Meeting)
          .createQueryBuilder('m')
          .setLock('pessimistic_write')
          .where('m.id = :id', { id })
          .getOneOrFail();
        this.assertChange(noticeChangeBlock(locked, actor.id));

        const repo = manager.getRepository(MeetingNoticeFile);
        replaced = await repo.findOneBy({ meetingId: id });
        written = await this.storage.save(
          id,
          processed.content,
          processed.extension,
          AREA,
        );
        if (replaced) await repo.delete(replaced.id);
        const row = await repo.save(
          repo.create({
            meetingId: id,
            uploadedById: actor.id,
            originalName: name,
            storedName: written,
            mime: processed.mime,
            size: processed.content.length,
            sha256: processed.sha256,
          }),
        );
        const after = {
          fileId: row.id,
          name,
          mime: processed.mime,
          size: processed.content.length,
          sha256: processed.sha256,
        };
        await this.audit.log(
          {
            actorId: actor.id,
            action: replaced
              ? AuditAction.MEETING_NOTICE_REPLACED
              : AuditAction.MEETING_NOTICE_UPLOADED,
            entityType: 'meeting',
            entityId: id,
            before: replaced ? fileAudit(replaced) : null,
            after,
            ip,
          },
          manager,
        );
      });
    } catch (err) {
      // Nothing was saved in the database → remove what was written to disk.
      if (written) await this.storage.remove(id, written, AREA);
      throw err;
    }
    // Only after the commit: the old bytes are no longer referenced.
    const old = replaced as MeetingNoticeFile | null;
    if (old) await this.storage.remove(id, old.storedName, AREA);

    const row = await this.findRow(id);
    return noticeDto(row!, meeting, actor.id);
  }

  async remove(actor: AuthUser, id: string, ip: string | null): Promise<void> {
    const meeting = await this.loadVisible(actor, id);
    this.assertChange(noticeChangeBlock(meeting, actor.id));
    const file = await this.files.findOneBy({ meetingId: id });
    if (!file) throw new NotFoundException(MSG.notFound);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(MeetingNoticeFile).delete(file.id);
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_NOTICE_REMOVED,
          entityType: 'meeting',
          entityId: id,
          before: fileAudit(file),
          ip,
        },
        manager,
      );
    });
    await this.storage.remove(id, file.storedName, AREA);
  }
}

function fileAudit(file: MeetingNoticeFile) {
  return {
    fileId: file.id,
    name: file.originalName,
    mime: file.mime,
    size: file.size,
    sha256: file.sha256,
    uploadedById: file.uploadedById,
  };
}
