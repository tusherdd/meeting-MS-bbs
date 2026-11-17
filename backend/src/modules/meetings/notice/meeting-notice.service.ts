import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../../common/types/auth-user';
import { DHAKA_TZ } from '../../../common/utils/time';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { PdfService } from '../../reports/pdf/pdf.service';
import { User } from '../../users/entities/user.entity';
import { Meeting } from '../entities/meeting.entity';
import { MeetingStatus } from '../enums/meeting-status.enum';
import { MEETING_MESSAGES as MSG } from '../meetings.messages';
import { isAdmin } from '../meetings.service';
import {
  renderNoticeHtml,
  type NoticeInput,
  type NoticeOfficer,
} from './notice-template';

export interface NoticeFile {
  /** ASCII only: fixed text + the meeting date + the first 8 characters of its uuid. */
  filename: string;
  content: Buffer;
}

function officer(u: User): NoticeOfficer {
  return {
    nameBn: u.nameBn,
    designationBn: u.designation?.nameBn ?? null,
    designationRemark: u.designationRemark,
    wingBn: u.wing?.nameBn ?? null,
    priority: u.designation?.priority ?? null,
  };
}

/** "meeting-notice-2026-11-20-1a2b3c4d.pdf" (meeting date in Asia/Dhaka). */
export function noticeFilename(meeting: Pick<Meeting, 'id' | 'startAt'>) {
  const date = DateTime.fromJSDate(meeting.startAt, {
    zone: DHAKA_TZ,
  }).toFormat('yyyy-MM-dd');
  const shortId = meeting.id.replace(/[^0-9a-f]/gi, '').slice(0, 8);
  return `meeting-notice-${date}-${shortId}.pdf`;
}

/**
 * Single-meeting notice PDF "সভার নোটিশ" (v1.10, SPEC.md §6.8). Rendered by the shared lazy
 * PdfService; always Bangla. Who may export: the meeting's people and admins (others 403;
 * unknown id 404). Cancelled meetings get 409. Each export is audited (MEETING_NOTICE_EXPORTED).
 */
@Injectable()
export class MeetingNoticeService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly pdf: PdfService,
    private readonly audit: AuditService,
  ) {}

  /** Checks access and builds the template input (no rendering: unit-testable without Chrome). */
  async buildInput(
    actor: AuthUser,
    id: string,
    now = new Date(),
  ): Promise<{ meeting: Meeting; input: NoticeInput }> {
    const meeting = await this.meetings.findOne({
      where: { id },
      relations: {
        chair: { designation: true, wing: true },
        participants: { user: { designation: true, wing: true } },
        guests: true,
      },
    });
    if (!meeting) throw new NotFoundException(MSG.notFound);
    const isPerson = meeting.participants.some((p) => p.userId === actor.id);
    if (!isAdmin(actor) && !isPerson)
      throw new ForbiddenException(MSG.noticeForbidden);
    if (meeting.status === MeetingStatus.CANCELLED)
      throw new ConflictException(MSG.noticeCancelled);

    const signer = await this.users.findOneOrFail({
      where: { id: actor.id },
      relations: { designation: true },
    });
    return {
      meeting,
      input: {
        title: meeting.title,
        agenda: meeting.agenda,
        startAt: meeting.startAt,
        room: meeting.room,
        onlineLink: meeting.onlineLink,
        chair: meeting.chair ? officer(meeting.chair) : null,
        // The participant rows hold every internal person: organizer, chair and members.
        officers: meeting.participants.map((p) => officer(p.user)),
        guests: (meeting.guests ?? []).map((g) => ({
          name: g.name,
          designation: g.designation,
          isChair: g.isChair,
        })),
        signer: {
          nameBn: signer.nameBn,
          designationBn: signer.designation?.nameBn ?? null,
          designationRemark: signer.designationRemark,
        },
        exportedAt: now,
      },
    };
  }

  async noticePdf(
    actor: AuthUser,
    id: string,
    ip: string | null,
  ): Promise<NoticeFile> {
    const { meeting, input } = await this.buildInput(actor, id);
    const content = await this.pdf.render(renderNoticeHtml(input));
    await this.audit.log({
      actorId: actor.id,
      action: AuditAction.MEETING_NOTICE_EXPORTED,
      entityType: 'meeting',
      entityId: meeting.id,
      after: { filename: noticeFilename(meeting) },
      ip,
    });
    return { filename: noticeFilename(meeting), content };
  }
}
