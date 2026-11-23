import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
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
import { OfficeScopeService } from '../office-scope/office-scope.service';
import {
  attachmentChangeBlock,
  attachmentLimitReached,
  canChangeAttachments,
  canViewAttachments,
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_ATTACHMENTS,
  type AttachmentBlock,
} from './attachment-rules';
import { ATTACHMENT_MESSAGES as MSG } from './attachments.messages';
import type { AttachmentDto, AttachmentListDto } from './dto/attachment.dto';
import { MeetingAttachment } from './entities/meeting-attachment.entity';

/** What multer hands over (memory storage). */
export interface IncomingAttachmentFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const AREA = 'attachments' as const;

function attachmentDto(row: MeetingAttachment): AttachmentDto {
  return {
    id: row.id,
    name: row.name,
    originalName: row.originalName,
    mime: row.mime,
    size: row.size,
    uploadedAt: row.createdAt,
  };
}

function fileAudit(row: MeetingAttachment) {
  return {
    attachmentId: row.id,
    label: row.name,
    name: row.originalName,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    uploadedById: row.uploadedById,
  };
}

/**
 * "অন্যান্য সংযুক্তি" / other attachments (v1.17, SPEC.md §6.11): up to 5 labelled files per
 * meeting, added and removed only by the organizer; viewed by everyone who can view the notice.
 * Stored privately like the notice (DECISION_UPLOAD_DIR/attachments/<meetingId>/).
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingAttachment)
    private readonly files: Repository<MeetingAttachment>,
    private readonly storage: DecisionStorageService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
    /** Office report viewers may view attachments of meetings in their scope (like the notice). */
    @Optional() private readonly officeScope?: OfficeScopeService,
  ) {}

  /** The meeting, if the actor may view it (its people, admins, office report scope; else 403 / 404). */
  private async loadVisible(actor: AuthUser, id: string): Promise<Meeting> {
    const meeting = await this.meetings.findOneBy({ id });
    if (!meeting) throw new NotFoundException(MEETING_MESSAGES.notFound);
    const isPerson = await this.dataSource
      .getRepository(MeetingParticipant)
      .existsBy({ meetingId: id, userId: actor.id });
    const viewer = { id: actor.id, isAdmin: isAdmin(actor), isPerson };
    if (
      !canViewAttachments(viewer) &&
      !(await this.officeScope?.canViewMeeting(actor, id))
    )
      throw new ForbiddenException(MSG.forbidden);
    return meeting;
  }

  private assertChange(block: AttachmentBlock | null): void {
    if (block === 'forbidden')
      throw new ForbiddenException(MSG.changeForbidden);
    if (block === 'cancelled') throw new ConflictException(MSG.cancelled);
  }

  async list(actor: AuthUser, id: string): Promise<AttachmentListDto> {
    const meeting = await this.loadVisible(actor, id);
    const rows = await this.files.find({
      where: { meetingId: id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return {
      items: rows.map(attachmentDto),
      canManage: canChangeAttachments(meeting, actor.id),
      max: MAX_ATTACHMENTS,
    };
  }

  async download(
    actor: AuthUser,
    id: string,
    attachmentId: string,
  ): Promise<{ file: MeetingAttachment; stream: ReadStream }> {
    await this.loadVisible(actor, id);
    const file = await this.files.findOneBy({
      id: attachmentId,
      meetingId: id,
    });
    if (!file) throw new NotFoundException(MSG.notFound);
    return { file, stream: this.storage.open(id, file.storedName, AREA) };
  }

  async upload(
    actor: AuthUser,
    id: string,
    label: string,
    incoming: IncomingAttachmentFile | undefined,
    ip: string | null,
  ): Promise<AttachmentDto> {
    const meeting = await this.loadVisible(actor, id);
    // Cheap checks first: no file is read unless the organizer may add one and there is room.
    this.assertChange(attachmentChangeBlock(meeting, actor.id));
    if (attachmentLimitReached(await this.files.countBy({ meetingId: id })))
      throw new ConflictException(MSG.tooMany);
    if (!incoming) throw new BadRequestException(MSG.fileMissing);
    if (
      incoming.size > MAX_ATTACHMENT_FILE_BYTES ||
      incoming.buffer.length > MAX_ATTACHMENT_FILE_BYTES
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
    const originalName = sanitizeFileName(clientName, processed.extension);

    let written: string | null = null;
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Lock the meeting row: parallel uploads are counted one after the other, and a cancel at
        // the same moment is seen.
        const locked = await manager
          .getRepository(Meeting)
          .createQueryBuilder('m')
          .setLock('pessimistic_write')
          .where('m.id = :id', { id })
          .getOneOrFail();
        this.assertChange(attachmentChangeBlock(locked, actor.id));
        const repo = manager.getRepository(MeetingAttachment);
        if (attachmentLimitReached(await repo.countBy({ meetingId: id })))
          throw new ConflictException(MSG.tooMany);

        written = await this.storage.save(
          id,
          processed.content,
          processed.extension,
          AREA,
        );
        const row = await repo.save(
          repo.create({
            meetingId: id,
            uploadedById: actor.id,
            name: label,
            originalName,
            storedName: written,
            mime: processed.mime,
            size: processed.content.length,
            sha256: processed.sha256,
          }),
        );
        await this.audit.log(
          {
            actorId: actor.id,
            action: AuditAction.MEETING_ATTACHMENT_ADDED,
            entityType: 'meeting',
            entityId: id,
            after: fileAudit(row),
            ip,
          },
          manager,
        );
        return attachmentDto(row);
      });
    } catch (err) {
      // Nothing was saved in the database → remove what was written to disk.
      if (written) await this.storage.remove(id, written, AREA);
      throw err;
    }
  }

  async remove(
    actor: AuthUser,
    id: string,
    attachmentId: string,
    ip: string | null,
  ): Promise<void> {
    const meeting = await this.loadVisible(actor, id);
    this.assertChange(attachmentChangeBlock(meeting, actor.id));
    const file = await this.files.findOneBy({
      id: attachmentId,
      meetingId: id,
    });
    if (!file) throw new NotFoundException(MSG.notFound);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(MeetingAttachment).delete(file.id);
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_ATTACHMENT_REMOVED,
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
