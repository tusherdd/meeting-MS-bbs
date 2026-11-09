import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { DataSource, In, Repository } from 'typeorm';
import { paginated } from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import {
  DHAKA_TZ,
  type DateRange,
  type ReportPeriod,
} from '../../common/utils/time';
import { Designation } from '../designations/entities/designation.entity';
import { MeetingConflict } from '../meetings/entities/meeting-conflict.entity';
import { MeetingParticipant } from '../meetings/entities/meeting-participant.entity';
import { Meeting } from '../meetings/entities/meeting.entity';
import { ConflictStatus } from '../meetings/enums/conflict-status.enum';
import type { ParticipantRole } from '../meetings/enums/participant-role.enum';
import { User } from '../users/entities/user.entity';
import { Wing } from '../wings/entities/wing.entity';
import type {
  OfficeFiltersDto,
  OfficeReportDto,
  PeriodDto,
  PersonalReportDto,
  ReportMeetingDto,
} from './dto/report.dto';
import { PdfService } from './pdf/pdf.service';
import {
  dayRows,
  renderReportHtml,
  statusRows,
  type ReportHeader,
} from './pdf/report-template';
import {
  officeBreakdown,
  personalSummary,
  type ReportMeeting,
} from './report-math';
import { resolvePeriod, type ResolvedPeriod } from './report-period';

/** PDFs list at most this many meetings (the summary always covers all of them). */
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
    period: ReportPeriod,
    date: string | undefined,
    page: { page: number; limit: number; skip: number },
  ): Promise<PersonalReportDto> {
    const p = resolvePeriod(period, date);
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
        designationBn: officer.designation?.nameBn ?? null,
      },
      summary: personalSummary(meetings, actor.id, conflicts),
      meetings: paginated(
        meetings.slice(page.skip, page.skip + page.limit).map(toItem),
        meetings.length,
        page,
      ),
    };
  }

  async personalPdf(
    actor: AuthUser,
    period: ReportPeriod,
    date?: string,
  ): Promise<PdfFile> {
    const p = resolvePeriod(period, date);
    const [officer, meetings, conflicts] = await Promise.all([
      this.officer(actor.id),
      this.load(p.range, { personId: actor.id }),
      this.personalConflicts(actor.id, p.range),
    ]);
    const s = personalSummary(meetings, actor.id, conflicts);
    const html = renderReportHtml({
      header: this.header(p, [
        ['কর্মকর্তা', officer.nameBn],
        ['পদবি', officer.designation?.nameBn ?? '—'],
      ]),
      summary: [
        { label: 'মোট সভা', value: s.totalMeetings },
        { label: 'আমার আয়োজিত', value: s.organized },
        { label: 'অংশগ্রহণ (অন্যের আয়োজিত)', value: s.attended },
        ...statusRows(s.byStatus),
        { label: 'মোট সময় (ঘণ্টা, বাতিল ছাড়া)', value: s.totalHours },
        {
          label: 'আমার সভার বিরুদ্ধে সংঘাত',
          value: s.conflictsRaisedAgainstMyMeetings,
        },
        { label: 'আমার সভা থেকে সৃষ্ট সংঘাত', value: s.conflictsIRaised },
      ],
      extraTables: [
        {
          title: 'দিনভিত্তিক হিসাব',
          headers: ['তারিখ', 'সভা', 'ঘণ্টা'],
          rows: dayRows(s.byDay),
        },
      ],
      meetings: meetings.slice(0, PDF_MAX_ROWS),
      showMyRole: true,
      totalMeetings: meetings.length,
    });
    return {
      filename: `meeting-report-${p.fileKey}.pdf`,
      content: await this.pdf.render(html),
    };
  }

  // ---------------------------------------------------------------- office

  async office(
    period: ReportPeriod,
    date: string | undefined,
    filter: OfficeFilter,
    page: { page: number; limit: number; skip: number },
  ): Promise<OfficeReportDto> {
    const p = resolvePeriod(period, date);
    const [meetings, filters] = await Promise.all([
      this.load(p.range, { office: filter }),
      this.filterNames(filter),
    ]);
    const conflicts = await this.officeConflicts(meetings.map((m) => m.id));
    return {
      period: this.periodDto(p),
      filters,
      summary: { ...officeBreakdown(meetings), conflicts },
      meetings: paginated(
        meetings.slice(page.skip, page.skip + page.limit).map(toItem),
        meetings.length,
        page,
      ),
    };
  }

  async officePdf(
    period: ReportPeriod,
    date: string | undefined,
    filter: OfficeFilter,
  ): Promise<PdfFile> {
    const p = resolvePeriod(period, date);
    const [meetings, filters] = await Promise.all([
      this.load(p.range, { office: filter }),
      this.filterNames(filter),
    ]);
    const conflicts = await this.officeConflicts(meetings.map((m) => m.id));
    const o = officeBreakdown(meetings);
    const html = renderReportHtml({
      header: this.header(p, [
        ['প্রতিবেদন', 'অফিসভিত্তিক'],
        ['উইং', filters.wingBn ?? 'সব উইং'],
        ['পদবি', filters.designationBn ?? 'সব পদবি'],
      ]),
      summary: [
        { label: 'মোট সভা', value: o.totalMeetings },
        ...statusRows(o.byStatus),
        { label: 'মোট সময় (ঘণ্টা, বাতিল ছাড়া)', value: o.totalHours },
        { label: 'অমীমাংসিত সংঘাত', value: conflicts.pending },
        { label: 'মীমাংসিত সংঘাত', value: conflicts.resolved },
      ],
      extraTables: [
        {
          title: 'উইংভিত্তিক (আয়োজকের উইং)',
          headers: ['উইং', 'সভা', 'ঘণ্টা'],
          rows: o.byWing.map((w) => [w.nameBn, w.meetings, w.hours]),
        },
        {
          title: 'পদবিভিত্তিক (আয়োজকের পদবি)',
          headers: ['পদবি', 'অগ্রাধিকার', 'সভা', 'ঘণ্টা'],
          rows: o.byDesignation.map((d) => [
            d.nameBn,
            d.priority ?? '—',
            d.meetings,
            d.hours,
          ]),
        },
        {
          title: 'সর্বাধিক সভা আয়োজনকারী (শীর্ষ ১০)',
          headers: ['নাম', 'পদবি', 'সভা', 'ঘণ্টা'],
          rows: o.topOrganizers.map((t) => [
            t.nameBn,
            t.designationBn ?? '—',
            t.meetings,
            t.hours,
          ]),
        },
        {
          title: 'সবচেয়ে ব্যস্ত দিন',
          headers: ['তারিখ', 'সভা', 'ঘণ্টা'],
          rows: dayRows(o.busiestDays),
        },
      ],
      meetings: meetings.slice(0, PDF_MAX_ROWS),
      showMyRole: false,
      totalMeetings: meetings.length,
    });
    return {
      filename: `office-meeting-report-${p.fileKey}.pdf`,
      content: await this.pdf.render(html),
    };
  }

  // ---------------------------------------------------------------- loading

  /** Meetings STARTING in the range, with organizer designation and wing. */
  private async load(
    range: DateRange,
    scope: { personId: string } | { office: OfficeFilter },
  ): Promise<ReportMeeting[]> {
    const qb = this.meetings
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.organizer', 'o')
      .leftJoinAndSelect('o.designation', 'd')
      .leftJoinAndSelect('o.wing', 'w')
      .where('m.startAt >= :start AND m.startAt < :end', {
        start: range.start,
        end: range.end,
      })
      .orderBy('m.startAt', 'ASC')
      .addOrderBy('m.id', 'ASC');

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
      'personId' in scope && rows.length > 0
        ? new Map<string, ParticipantRole>(
            (
              await this.dataSource.getRepository(MeetingParticipant).find({
                select: { meetingId: true, role: true },
                where: {
                  userId: scope.personId,
                  meetingId: In(rows.map((r) => r.id)),
                },
              })
            ).map((r) => [r.meetingId, r.role]),
          )
        : new Map<string, ParticipantRole>();

    return rows.map((m) => ({
      id: m.id,
      title: m.title,
      startAt: m.startAt,
      endAt: m.endAt,
      room: m.room,
      status: m.status,
      organizerId: m.organizerId,
      organizerNameBn: m.organizer.nameBn,
      organizerDesignationId: m.organizer.designationId,
      organizerDesignationBn: m.organizer.designation?.nameBn ?? null,
      organizerDesignationPriority: m.organizer.designation?.priority ?? null,
      organizerWingId: m.organizer.wingId,
      organizerWingBn: m.organizer.wing?.nameBn ?? null,
      myRole: roles.get(m.id) ?? null,
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

  /** Conflicts of the report's meetings (by the lower meeting), split by status. */
  private async officeConflicts(meetingIds: string[]) {
    if (meetingIds.length === 0) return { pending: 0, resolved: 0 };
    const rows = await this.dataSource
      .getRepository(MeetingConflict)
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('c.lowerMeetingId IN (:...ids)', { ids: meetingIds })
      .groupBy('c.status')
      .getRawMany<{ status: ConflictStatus; count: number }>();
    const of = (s: ConflictStatus) =>
      Number(rows.find((r) => r.status === s)?.count ?? 0);
    return {
      pending: of(ConflictStatus.PENDING),
      resolved: of(ConflictStatus.RESOLVED),
    };
  }

  private async officer(id: string): Promise<User> {
    return this.dataSource.getRepository(User).findOneOrFail({
      where: { id },
      relations: { designation: true },
    });
  }

  private async filterNames(filter: OfficeFilter): Promise<OfficeFiltersDto> {
    const [wing, designation] = await Promise.all([
      filter.wingId
        ? this.dataSource.getRepository(Wing).findOneBy({ id: filter.wingId })
        : null,
      filter.designationId
        ? this.dataSource
            .getRepository(Designation)
            .findOneBy({ id: filter.designationId })
        : null,
    ]);
    return {
      wingBn: wing?.nameBn ?? null,
      designationBn: designation?.nameBn ?? null,
    };
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

  private header(
    p: ResolvedPeriod,
    subjectLines: Array<[string, string]>,
  ): ReportHeader {
    const generated = DateTime.now()
      .setZone(DHAKA_TZ)
      .setLocale('bn')
      .toFormat('d MMMM yyyy, HH:mm');
    return {
      subjectLines,
      periodLabelBn: p.labelBn,
      generatedAtBn: `প্রস্তুত: ${generated}`,
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
    organizerDesignationBn: m.organizerDesignationBn,
    myRole: m.myRole,
  };
}
