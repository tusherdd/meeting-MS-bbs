import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { DataSource, In, Repository } from 'typeorm';
import { paginated } from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { DHAKA_TZ, type DateRange } from '../../common/utils/time';
import { MeetingConflict } from '../meetings/entities/meeting-conflict.entity';
import { MeetingParticipant } from '../meetings/entities/meeting-participant.entity';
import { Meeting } from '../meetings/entities/meeting.entity';
import type { ParticipantRole } from '../meetings/enums/participant-role.enum';
import { noticeMimes } from '../notices/notice-mime';
import { decisionViewableIds } from '../decisions/decision-viewable';
import { User } from '../users/entities/user.entity';
import type {
  PeriodDto,
  PersonalReportDto,
  ReportMeetingDto,
} from './dto/report.dto';
import { PdfService } from './pdf/pdf.service';
import { cappedNoteBn, type ScheduleHeader } from './pdf/report-template';
import { buildSchedulePdf } from './pdf/schedule-pdf';
import {
  headerDesignationBn,
  scheduleTitleBn,
  toScheduleRows,
  withJanab,
} from './pdf/schedule-format';
import { personalSummary, type ReportMeeting } from './report-math';
import {
  resolveReportQuery,
  type ReportRangeQuery,
  type ResolvedPeriod,
} from './report-period';

/** PDFs list at most this many meetings (a note says how many there are in total). */
export const PDF_MAX_ROWS = 1000;

export interface OfficeFilter {
  wingId?: string;
  designationId?: string;
}

export interface PdfFile {
  filename: string;
  content: Buffer;
}

/** Officer and office reports (SPEC.md §6.6) as JSON and PDF. */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    private readonly pdf: PdfService,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------- personal

  async personal(
    actor: AuthUser,
    when: ReportRangeQuery,
    page: { page: number; limit: number; skip: number },
  ): Promise<PersonalReportDto> {
    const p = resolveReportQuery(when);
    const [officer, meetings, conflicts] = await Promise.all([
      this.officer(actor.id),
      this.load(p.range, { personId: actor.id }),
      this.personalConflicts(actor.id, p.range),
    ]);
    return {
      period: this.periodDto(p),
      officer: {
        id: officer.id,
        nameBn: officer.nameBn,
        nameEn: officer.nameEn,
        designationBn: officer.designation?.nameBn ?? null,
        designationEn: officer.designation?.nameEn ?? null,
      },
      summary: personalSummary(meetings, actor.id, conflicts),
      meetings: paginated(
        meetings.slice(page.skip, page.skip + page.limit).map(toItem),
        meetings.length,
        page,
      ),
    };
  }

  /** My report as the PDF "কর্মসূচি" (v1.14): my meetings of the period, without cancelled ones. */
  async personalPdf(actor: AuthUser, when: ReportRangeQuery): Promise<PdfFile> {
    const p = resolveReportQuery(when);
    const meetings = await this.load(p.range, { personId: actor.id });
    return {
      filename: `meeting-report-${p.fileKey}.pdf`,
      content: await this.schedulePdf(actor, p, meetings),
    };
  }

  // ---------------------------------------------------------------- PDF

  /** Header of the downloading user + the rows; rendered in two passes (buildSchedulePdf). */
  private async schedulePdf(
    actor: AuthUser,
    p: ResolvedPeriod,
    meetings: ReportMeeting[],
  ): Promise<Buffer> {
    const viewer = await this.officer(actor.id);
    const allRows = toScheduleRows(meetings);
    const rows = allRows.slice(0, PDF_MAX_ROWS);
    const header: ScheduleHeader = {
      titleBn: scheduleTitleBn(p.period),
      officerBn: withJanab(viewer.nameBn),
      designationBn: headerDesignationBn(
        viewer.designation?.nameBn,
        viewer.designation?.priority,
      ),
      periodLabelBn: p.labelBn,
      generatedAtBn: DateTime.now()
        .setZone(DHAKA_TZ)
        .setLocale('bn')
        .toFormat('d MMMM yyyy, HH:mm'),
      noteBn:
        rows.length < allRows.length
          ? cappedNoteBn(rows.length, allRows.length)
          : undefined,
    };
    return buildSchedulePdf(this.pdf, header, rows);
  }

  // ---------------------------------------------------------------- loading

  /** Meetings STARTING in the range, with organizer designation and wing. */
  private async load(
    range: DateRange,
    scope: { personId: string } | { office: OfficeFilter },
    /** Whose `myRole` to fill: the report's officer, or (office report page) the admin viewer. */
    viewerArg?: string,
  ): Promise<ReportMeeting[]> {
    const viewerId = viewerArg ?? ('personId' in scope ? scope.personId : null);
    const qb = this.meetings
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.organizer', 'o')
      .leftJoinAndSelect('o.designation', 'd')
      .leftJoinAndSelect('o.wing', 'w')
      .leftJoinAndSelect('m.chair', 'ch')
      .leftJoinAndSelect('ch.designation', 'chd')
      .leftJoinAndSelect('m.guests', 'g')
      .loadRelationCountAndMap('m.decisionFileCount', 'm.decisionFiles')
      .loadRelationCountAndMap('m.noticeFileCount', 'm.noticeFiles')
      .where('m.startAt >= :start AND m.startAt < :end', {
        start: range.start,
        end: range.end,
      })
      .orderBy('m.startAt', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .addOrderBy('g.createdAt', 'ASC');

    if ('personId' in scope) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp."meetingId" = m.id AND mp."userId" = :me)',
        { me: scope.personId },
      );
    } else {
      if (scope.office.wingId)
        qb.andWhere('o.wingId = :wingId', { wingId: scope.office.wingId });
      if (scope.office.designationId) {
        qb.andWhere('o.designationId = :designationId', {
          designationId: scope.office.designationId,
        });
      }
    }
    const rows = await qb.getMany();

    const roles =
      viewerId && rows.length > 0
        ? new Map<string, ParticipantRole>(
            (
              await this.dataSource.getRepository(MeetingParticipant).find({
                select: { meetingId: true, role: true },
                where: {
                  userId: viewerId,
                  meetingId: In(rows.map((r) => r.id)),
                },
              })
            ).map((r) => [r.meetingId, r.role]),
          )
        : new Map<string, ParticipantRole>();
    // v1.17: notice type for the row menu label.
    const mimes = await noticeMimes(
      this.dataSource.manager,
      rows.filter((m) => (m.noticeFileCount ?? 0) > 0).map((m) => m.id),
    );
    const viewable = await decisionViewableIds(
      this.dataSource.manager,
      rows.filter((m) => (m.decisionFileCount ?? 0) > 0).map((m) => m.id),
    );

    return rows.map((m) => ({
      id: m.id,
      title: m.title,
      startAt: m.startAt,
      endAt: m.endAt,
      room: m.room,
      status: m.status,
      organizerId: m.organizerId,
      organizerNameBn: m.organizer.nameBn,
      organizerNameEn: m.organizer.nameEn,
      organizerDesignationId: m.organizer.designationId,
      organizerDesignationBn: m.organizer.designation?.nameBn ?? null,
      organizerDesignationEn: m.organizer.designation?.nameEn ?? null,
      organizerDesignationPriority: m.organizer.designation?.priority ?? null,
      organizerWingId: m.organizer.wingId,
      organizerWingBn: m.organizer.wing?.nameBn ?? null,
      organizerWingEn: m.organizer.wing?.nameEn ?? null,
      myRole: roles.get(m.id) ?? null,
      chairNameBn:
        m.chair?.nameBn ?? m.guests.find((g) => g.isChair)?.name ?? null,
      chairNameEn:
        m.chair?.nameEn ?? m.guests.find((g) => g.isChair)?.name ?? null,
      chairDesignationBn: m.chair
        ? (m.chair.designation?.nameBn ?? null)
        : (m.guests.find((g) => g.isChair)?.designation ?? null),
      guests: m.guests.map((g) => ({
        name: g.name,
        designation: g.designation,
      })),
      decisionFileCount: m.decisionFileCount ?? 0,
      hasNotice: (m.noticeFileCount ?? 0) > 0,
      noticeMime: mimes.get(m.id) ?? null,
      decisionViewable: viewable.has(m.id),
    }));
  }

  /** Conflicts whose lower/higher meeting I organize, counted for meetings starting in the range. */
  private async personalConflicts(userId: string, range: DateRange) {
    const count = (side: 'lowerMeeting' | 'higherMeeting') =>
      this.dataSource
        .getRepository(MeetingConflict)
        .createQueryBuilder('c')
        .innerJoin(`c.${side}`, 'm')
        .where('m.organizerId = :userId', { userId })
        .andWhere('m.startAt >= :start AND m.startAt < :end', {
          start: range.start,
          end: range.end,
        })
        .getCount();
    const [againstMine, raisedByMe] = await Promise.all([
      count('lowerMeeting'),
      count('higherMeeting'),
    ]);
    return { againstMine, raisedByMe };
  }

  private async officer(id: string): Promise<User> {
    return this.dataSource.getRepository(User).findOneOrFail({
      where: { id },
      relations: { designation: true },
    });
  }

  private periodDto(p: ResolvedPeriod): PeriodDto {
    return {
      period: p.period,
      date: p.date,
      labelBn: p.labelBn,
      from: p.range.start,
      to: p.range.end,
    };
  }
}

function toItem(m: ReportMeeting): ReportMeetingDto {
  return {
    id: m.id,
    title: m.title,
    startAt: m.startAt,
    endAt: m.endAt,
    room: m.room,
    status: m.status,
    organizerNameBn: m.organizerNameBn,
    organizerNameEn: m.organizerNameEn,
    organizerDesignationBn: m.organizerDesignationBn,
    organizerDesignationEn: m.organizerDesignationEn,
    organizerWingBn: m.organizerWingBn,
    organizerWingEn: m.organizerWingEn,
    myRole: m.myRole,
    chairNameBn: m.chairNameBn,
    chairNameEn: m.chairNameEn,
    guests: m.guests,
    decisionFileCount: m.decisionFileCount ?? 0,
    hasNotice: m.hasNotice ?? false,
    noticeMime: m.noticeMime ?? null,
    decisionViewable: m.decisionViewable ?? false,
  };
}
