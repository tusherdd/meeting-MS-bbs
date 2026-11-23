import { OfficeScopeService } from '../office-scope/office-scope.service';
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
import { Brackets, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { MeetingSummaryDto } from '../meetings/dto/meeting-response.dto';
import { Meeting } from '../meetings/entities/meeting.entity';
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';
import { MEETING_MESSAGES } from '../meetings/meetings.messages';
import { isAdmin, MeetingsService } from '../meetings/meetings.service';
import { ChannelName } from '../notifications/channels/notification-channel';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DecisionFileError,
  decodeUploadName,
  displayName,
  processDecisionFile,
  sanitizeFileName,
  type ProcessedDecisionFile,
} from './decision-file';
import {
  canDeleteDecisionFile,
  canViewDecisions,
  decisionStatus,
  DecisionStatus,
  MAX_DECISION_FILE_BYTES,
  MAX_DECISION_FILE_MB,
  MAX_DECISION_FILES,
  uploadBlock,
  uploadNoticeRecipients,
  type DecisionViewer,
} from './decision-rules';
import { DecisionStorageService } from './decision-storage.service';
import { DECISION_MESSAGES as MSG } from './decisions.messages';
import type {
  DecisionDetailDto,
  DecisionListQueryDto,
  DecisionSummaryDto,
} from './dto/decision.dto';
import { MeetingDecisionFile } from './entities/meeting-decision-file.entity';

/** What multer hands over (memory storage). */
export interface IncomingFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const LEAD_ROLES = [ParticipantRole.ORGANIZER, ParticipantRole.CHAIR];

/** Bell text (always Bangla, SPEC.md §6.9; "কার্যবিবরণী" since v1.13). */
export function decisionUploadedNotice(meeting: { id: string; title: string }) {
  return {
    type: NotificationType.MEETING_DECISION_UPLOADED,
    title: `সভা কার্যবিবরণী: ${meeting.title}`,
    body: `"${meeting.title}" সভার কার্যবিবরণী আপলোড করা হয়েছে।`,
    link: `/meetings/${meeting.id}/decision`,
  };
}

/**
 * Meeting minutes ("সভা কার্যবিবরণী"; v1.11 as "decisions", renamed in v1.13; SPEC.md §6.9):
 * upload, list, download and delete minutes files, plus the per-user Pending / Complete lists
 * and counts. Code names keep "decision".
 */
@Injectable()
export class DecisionsService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingDecisionFile)
    private readonly files: Repository<MeetingDecisionFile>,
    private readonly storage: DecisionStorageService,
    private readonly meetingsService: MeetingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
    /** v1.15: office report viewers may view / download minutes of meetings in their scope. */
    @Optional() private readonly officeScope?: OfficeScopeService,
  ) {}

  // ---------------------------------------------------------------- access

  private async load(id: string): Promise<Meeting> {
    const meeting = await this.meetings.findOne({
      where: { id },
      relations: {
        organizer: { designation: true, wing: true },
        participants: true,
      },
    });
    if (!meeting) throw new NotFoundException(MEETING_MESSAGES.notFound);
    return meeting;
  }

  private viewer(actor: AuthUser, meeting: Meeting): DecisionViewer {
    return {
      id: actor.id,
      isAdmin: isAdmin(actor),
      role:
        meeting.participants.find((p) => p.userId === actor.id)?.role ?? null,
    };
  }

  /**
   * The meeting's people, admins and (v1.15) office report viewers whose scope covers it —
   * those only view and download (no role: no upload, no delete); everyone else 403
   * (unknown meeting 404).
   */
  private async loadVisible(actor: AuthUser, id: string) {
    const meeting = await this.load(id);
    const viewer = this.viewer(actor, meeting);
    if (
      !canViewDecisions(viewer) &&
      !(await this.officeScope?.canViewMeeting(actor, id))
    )
      throw new ForbiddenException(MSG.forbidden);
    return { meeting, viewer };
  }

  // ---------------------------------------------------------------- read

  async detail(actor: AuthUser, id: string): Promise<DecisionDetailDto> {
    const { meeting, viewer } = await this.loadVisible(actor, id);
    const files = await this.files.find({
      where: { meetingId: id },
      relations: { uploadedBy: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    meeting.decisionFileCount = files.length;
    const [summary] = await this.meetingsService.toSummaries(actor, [meeting]);
    const block = uploadBlock(meeting, viewer, files.length);
    return {
      meeting: summary,
      status: decisionStatus(meeting, files.length),
      canUpload: block === null,
      uploadBlock: block,
      maxFiles: MAX_DECISION_FILES,
      maxFileMb: MAX_DECISION_FILE_MB,
      files: files.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        mime: f.mime,
        size: f.size,
        createdAt: f.createdAt,
        uploadedBy: {
          id: f.uploadedBy.id,
          nameBn: f.uploadedBy.nameBn,
          nameEn: f.uploadedBy.nameEn,
        },
        canDelete: canDeleteDecisionFile(viewer, f),
      })),
    };
  }

  async download(
    actor: AuthUser,
    id: string,
    fileId: string,
  ): Promise<{ file: MeetingDecisionFile; stream: ReadStream }> {
    await this.loadVisible(actor, id);
    const file = await this.files.findOneBy({ id: fileId, meetingId: id });
    if (!file) throw new NotFoundException(MSG.fileNotFound);
    return { file, stream: this.storage.open(id, file.storedName) };
  }

  // ---------------------------------------------------------------- upload

  async upload(
    actor: AuthUser,
    id: string,
    incoming: IncomingFile[] | undefined,
    ip: string | null,
  ): Promise<DecisionDetailDto> {
    const { meeting, viewer } = await this.loadVisible(actor, id);
    if (!incoming?.length) throw new BadRequestException(MSG.fileMissing);
    // Cheap checks first (no file is read before the rules allow an upload at all).
    this.assertUpload(
      uploadBlock(
        meeting,
        viewer,
        await this.files.countBy({ meetingId: id }),
        incoming.length,
      ),
    );

    const processed: Array<{ name: string; file: ProcessedDecisionFile }> = [];
    for (const f of incoming) {
      const clientName = decodeUploadName(f.originalname);
      const shownName = displayName(clientName);
      if (
        f.size > MAX_DECISION_FILE_BYTES ||
        f.buffer.length > MAX_DECISION_FILE_BYTES
      )
        throw new PayloadTooLargeException(MSG.tooLarge);
      try {
        const file = await processDecisionFile(f.buffer);
        processed.push({
          name: sanitizeFileName(clientName, file.extension),
          file,
        });
      } catch (err) {
        if (err instanceof DecisionFileError) {
          throw new BadRequestException(
            err.reason === 'type'
              ? MSG.badType(shownName)
              : err.reason === 'macro'
                ? MSG.macro(shownName)
                : MSG.unreadable(shownName),
          );
        }
        throw err;
      }
    }

    const written: string[] = [];
    try {
      await this.dataSource.transaction(async (manager) => {
        // Lock the meeting row: parallel uploads cannot pass the 10-file limit together, and a
        // cancel running at the same moment is seen.
        const locked = await manager
          .getRepository(Meeting)
          .createQueryBuilder('m')
          .setLock('pessimistic_write')
          .where('m.id = :id', { id })
          .getOneOrFail();
        const count = await manager
          .getRepository(MeetingDecisionFile)
          .countBy({ meetingId: id });
        this.assertUpload(uploadBlock(locked, viewer, count, processed.length));

        for (const { name, file } of processed) {
          const storedName = await this.storage.save(
            id,
            file.content,
            file.extension,
          );
          written.push(storedName);
          const row = await manager.getRepository(MeetingDecisionFile).save(
            manager.getRepository(MeetingDecisionFile).create({
              meetingId: id,
              uploadedById: actor.id,
              originalName: name,
              storedName,
              mime: file.mime,
              size: file.content.length,
              sha256: file.sha256,
            }),
          );
          await this.audit.log(
            {
              actorId: actor.id,
              action: AuditAction.MEETING_DECISION_UPLOADED,
              entityType: 'meeting',
              entityId: id,
              after: {
                fileId: row.id,
                name,
                mime: file.mime,
                size: file.content.length,
                sha256: file.sha256,
              },
              ip,
            },
            manager,
          );
        }
        await this.notifications.notify(
          uploadNoticeRecipients(locked, actor.id),
          decisionUploadedNotice(locked),
          [ChannelName.IN_APP], // bell only, no e-mail
          manager,
        );
      });
    } catch (err) {
      // Nothing was saved in the database → remove what was already written to disk.
      await Promise.all(written.map((n) => this.storage.remove(id, n)));
      throw err;
    }
    return this.detail(actor, id);
  }

  private assertUpload(block: ReturnType<typeof uploadBlock>): void {
    switch (block) {
      case null:
        return;
      case 'forbidden':
        throw new ForbiddenException(MSG.uploadForbidden);
      case 'cancelled':
        throw new ConflictException(MSG.cancelled);
      case 'notStarted':
        throw new ConflictException(MSG.notStarted);
      case 'tooMany':
        throw new BadRequestException(MSG.tooMany);
    }
  }

  // ---------------------------------------------------------------- delete

  async remove(
    actor: AuthUser,
    id: string,
    fileId: string,
    ip: string | null,
  ): Promise<void> {
    const { viewer } = await this.loadVisible(actor, id);
    const file = await this.files.findOneBy({ id: fileId, meetingId: id });
    if (!file) throw new NotFoundException(MSG.fileNotFound);
    if (!canDeleteDecisionFile(viewer, file))
      throw new ForbiddenException(MSG.deleteForbidden);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(MeetingDecisionFile).delete(file.id);
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_DECISION_DELETED,
          entityType: 'meeting',
          entityId: id,
          before: {
            fileId: file.id,
            name: file.originalName,
            mime: file.mime,
            size: file.size,
            sha256: file.sha256,
            uploadedById: file.uploadedById,
          },
          ip,
        },
        manager,
      );
    });
    // Only after the row is gone; the last file gone → the status is Pending again (derived).
    await this.storage.remove(id, file.storedName);
  }

  // ---------------------------------------------------------------- lists

  /** Meetings where I have one of `roles`, not cancelled, filtered by decision status. */
  private listQuery(
    actor: AuthUser,
    roles: ParticipantRole[],
    status: DecisionStatus | null,
    now: Date,
  ): SelectQueryBuilder<Meeting> {
    const qb = this.meetings
      .createQueryBuilder('m')
      .innerJoin(
        'm.participants',
        'mine',
        'mine.userId = :me AND mine.role IN (:...roles)',
        { me: actor.id, roles },
      )
      .where('m.status <> :cancelled', { cancelled: MeetingStatus.CANCELLED });
    const hasFile =
      'EXISTS (SELECT 1 FROM meeting_decision_files f WHERE f."meetingId" = m.id)';
    if (status === DecisionStatus.COMPLETE) qb.andWhere(hasFile);
    if (status === DecisionStatus.PENDING) {
      // v1.19: a meeting whose minutes are not required is never Pending.
      qb.andWhere(`NOT ${hasFile}`)
        .andWhere('m.minutesRequired = true')
        .andWhere(
          new Brackets((b) =>
            b
              .where('m.status = :completed', {
                completed: MeetingStatus.COMPLETED,
              })
              .orWhere('m.startAt <= :now', { now }),
          ),
        );
    }
    return qb;
  }

  async summary(
    actor: AuthUser,
    now = new Date(),
  ): Promise<DecisionSummaryDto> {
    const [pending, complete] = await Promise.all([
      this.listQuery(actor, LEAD_ROLES, DecisionStatus.PENDING, now).getCount(),
      this.listQuery(
        actor,
        LEAD_ROLES,
        DecisionStatus.COMPLETE,
        now,
      ).getCount(),
    ]);
    return { pending, complete };
  }

  async list(
    actor: AuthUser,
    query: DecisionListQueryDto,
    now = new Date(),
  ): Promise<PaginatedResponseDto<MeetingSummaryDto>> {
    const member = query.as === 'member';
    const [rows, total] = await this.listQuery(
      actor,
      member ? [ParticipantRole.MEMBER] : LEAD_ROLES,
      member ? DecisionStatus.PENDING : query.status,
      now,
    )
      .leftJoinAndSelect('m.organizer', 'o')
      .leftJoinAndSelect('o.designation', 'od')
      .leftJoinAndSelect('o.wing', 'ow')
      .loadRelationCountAndMap('m.decisionFileCount', 'm.decisionFiles')
      .loadRelationCountAndMap('m.noticeFileCount', 'm.noticeFiles')
      .orderBy('m.startAt', 'DESC')
      .addOrderBy('m.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return paginated(
      await this.meetingsService.toSummaries(actor, rows),
      total,
      query,
    );
  }
}
