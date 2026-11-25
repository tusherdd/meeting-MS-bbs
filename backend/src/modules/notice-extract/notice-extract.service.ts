import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import {
  DecisionFileError,
  decodeUploadName,
  displayName,
  processDecisionFile,
} from '../decisions/decision-file';
import { DECISION_MESSAGES } from '../decisions/decisions.messages';
import { MEETING_MESSAGES } from '../meetings/meetings.messages';
import { MAX_NOTICE_FILE_BYTES } from '../notices/notice-rules';
import { NOTICE_MESSAGES } from '../notices/notices.messages';
import { UserAdditionalCharge } from '../users/entities/user-additional-charge.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import type { NoticeExtractResponseDto } from './dto/notice-extract.dto';
import {
  NOTICE_EXTRACTOR,
  type NoticeExtractor,
} from './extractors/notice-extractor';
import { buildExtractResponse } from './match/notice-matching';
import type { OfficerRecord } from './match/officer-matcher';
import { NOTICE_EXTRACT_MESSAGES as MSG } from './notice-extract.messages';

/** What multer hands over (memory storage). */
export interface IncomingExtractFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * "Fill the meeting form from the notice" (v1.21, SPEC.md §6.12): reads an uploaded notice in
 * memory, returns the form fields and the matched officers. Nothing is stored, no meeting is
 * created; the file bytes are dropped when the request ends. The officer list never leaves the
 * server. Audit: NOTICE_EXTRACTED with method / success / duration only (never the content).
 */
@Injectable()
export class NoticeExtractService {
  private readonly logger = new Logger(NoticeExtractService.name);

  constructor(
    @Inject(NOTICE_EXTRACTOR) private readonly extractor: NoticeExtractor,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async extract(
    actor: AuthUser,
    incoming: IncomingExtractFile | undefined,
    ip: string | null,
  ): Promise<NoticeExtractResponseDto> {
    // Same people as "create meeting": every officer and admin, never the system account.
    if (actor.role === UserRole.SUPER_ADMIN)
      throw new ForbiddenException(MEETING_MESSAGES.superAdminOrganize);
    if (!incoming) throw new BadRequestException(NOTICE_MESSAGES.fileMissing);
    if (
      incoming.size > MAX_NOTICE_FILE_BYTES ||
      incoming.buffer.length > MAX_NOTICE_FILE_BYTES
    )
      throw new PayloadTooLargeException(NOTICE_MESSAGES.tooLarge);

    const shownName = displayName(decodeUploadName(incoming.originalname));
    let file: Awaited<ReturnType<typeof processDecisionFile>>;
    try {
      file = await processDecisionFile(incoming.buffer);
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

    const started = Date.now();
    try {
      const extraction = await this.extractor.extract({
        type: file.type,
        content: file.content,
      });
      const response = buildExtractResponse(
        extraction,
        await this.loadOfficers(),
      );
      await this.logAudit(actor, ip, true, started);
      return response;
    } catch (err) {
      // Never the content or the file name: only the error type.
      this.logger.warn(
        `Notice extraction failed: ${err instanceof Error ? err.name : 'unknown'}`,
      );
      await this.logAudit(actor, ip, false, started).catch(() => undefined);
      throw new UnprocessableEntityException(MSG.failed);
    }
  }

  private logAudit(
    actor: AuthUser,
    ip: string | null,
    success: boolean,
    started: number,
  ): Promise<void> {
    return this.audit.log({
      actorId: actor.id,
      action: AuditAction.NOTICE_EXTRACTED,
      entityType: 'meeting',
      entityId: null,
      after: {
        method: this.extractor.method,
        success,
        durationMs: Date.now() - started,
      },
      ip,
    });
  }

  /** Active officers (never the SUPER_ADMIN) with designation, wing and structured charges. */
  private async loadOfficers(): Promise<OfficerRecord[]> {
    const users = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .leftJoin('u.designation', 'd')
      .leftJoin('u.wing', 'w')
      .select(['u.id', 'u.nameBn', 'u.nameEn'])
      .addSelect(['d.id', 'd.nameBn', 'd.nameEn'])
      .addSelect(['w.id', 'w.nameBn', 'w.nameEn'])
      .where('u.isActive = true')
      .andWhere('u.role <> :system', { system: UserRole.SUPER_ADMIN })
      .getMany();
    if (users.length === 0) return [];

    const charges = await this.dataSource
      .getRepository(UserAdditionalCharge)
      .createQueryBuilder('c')
      .innerJoin('c.designation', 'cd')
      .leftJoin('c.wing', 'cw')
      .select(['c.id', 'c.userId'])
      .addSelect(['cd.id', 'cd.nameBn', 'cd.nameEn'])
      .addSelect(['cw.id', 'cw.nameBn', 'cw.nameEn'])
      .where('c.userId IN (:...ids)', { ids: users.map((u) => u.id) })
      .getMany();
    const byUser = new Map<string, OfficerRecord['charges'][number][]>();
    for (const c of charges) {
      if (!c.designation) continue;
      const list = byUser.get(c.userId) ?? [];
      list.push({
        designation: ref(c.designation),
        wing: c.wing ? ref(c.wing) : null,
      });
      byUser.set(c.userId, list);
    }

    return users.map((u) => ({
      id: u.id,
      nameBn: u.nameBn,
      nameEn: u.nameEn,
      designation: u.designation ? ref(u.designation) : null,
      wing: u.wing ? ref(u.wing) : null,
      charges: byUser.get(u.id) ?? [],
    }));
  }
}

function ref(r: { id: string; nameBn: string; nameEn: string }) {
  return { id: r.id, nameBn: r.nameBn, nameEn: r.nameEn };
}
