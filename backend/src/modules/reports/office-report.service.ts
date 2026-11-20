import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DateTime } from 'luxon';
import { paginated } from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { DHAKA_TZ, type DateRange } from '../../common/utils/time';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { OfficeReportScope } from '../designations/enums/office-report-scope.enum';
import { MeetingParticipant } from '../meetings/entities/meeting-participant.entity';
import { Meeting } from '../meetings/entities/meeting.entity';
import { OfficeScopeService } from '../office-scope/office-scope.service';
import { User } from '../users/entities/user.entity';
import { Wing } from '../wings/entities/wing.entity';
import type {
  OfficeMeetingRowDto,
  OfficeReportDto,
  OfficeReportQueryDto,
} from './dto/office-report.dto';
import {
  busiestDays,
  chairOptions,
  filterMeetings,
  officeCards,
  organizerWingOptions,
  roleOf,
  topParticipants,
  wingRows,
  type OfficeMeeting,
  type OfficePerson,
} from './office-report-math';
import { renderOfficeReportHtml } from './pdf/office-report-template';
import { PdfService } from './pdf/pdf.service';
import { headerDesignationBn, withJanab } from './pdf/schedule-format';
import { resolveReportQuery, type ResolvedPeriod } from './report-period';
import type { PdfFile } from './reports.service';

export const OFFICE_REPORT_MESSAGES = {
  forbidden: 'অফিস রিপোর্ট দেখার অনুমতি আপনার নেই।',
  noWing: 'আপনার প্রোফাইলে কোনো উইং নেই, তাই অফিস রিপোর্ট দেখানো যাবে না।',
  outOfScope: 'এই তথ্য আপনার অফিস রিপোর্টের আওতার বাইরে।',
  officerNotFound: 'কর্মকর্তা পাওয়া যায়নি।',
  wingNotFound: 'উইংটি পাওয়া যায়নি।',
} as const;

/** The resolved filters of one request, after the scope checks. */
interface OfficeContext {
  scope: OfficeReportScope.WING | OfficeReportScope.OFFICE;
  wing: Wing | null;
  officer: User | null;
  /** Top 5 participants only from this wing (WING viewers, or a chosen wing). */
  topWingId: string | null;
  /** WING viewers: the wings they may choose (own wing first, then charge wings, v1.16). */
  scopeWings: Array<{ id: string; nameBn: string; nameEn: string }>;
}

interface OfficeData {
  p: ResolvedPeriod;
  ctx: OfficeContext;
  report: OfficeReportDto;
}

/**
 * v1.15 office report "অফিস রিপোর্ট" (SPEC.md §6.10): one page for admins, OFFICE and WING viewers.
 * Every endpoint checks the scope on the server; the PDF recomputes the same data from the same
 * query (filters, page) and never renders client HTML.
 */
@Injectable()
export class OfficeReportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly officeScope: OfficeScopeService,
    private readonly pdf: PdfService,
    private readonly audit: AuditService,
  ) {}

  async report(
    actor: AuthUser,
    query: OfficeReportQueryDto,
  ): Promise<OfficeReportDto> {
    return (await this.build(actor, query)).report;
  }

  async reportPdf(
    actor: AuthUser,
    query: OfficeReportQueryDto,
    ip: string | null,
  ): Promise<PdfFile> {
    const { p, ctx, report } = await this.build(actor, query);
    const viewer = await this.dataSource.getRepository(User).findOneOrFail({
      where: { id: actor.id },
      relations: { designation: true },
    });
    const html = renderOfficeReportHtml({
      officerBn: withJanab(viewer.nameBn),
      designationBn: headerDesignationBn(
        viewer.designation?.nameBn,
        viewer.designation?.priority,
      ),
      periodLabelBn: p.labelBn,
      wingBn: ctx.wing?.nameBn ?? 'সকল উইং',
      officerFilterBn: ctx.officer ? officerLineBn(ctx.officer) : undefined,
      generatedAtBn: DateTime.now()
        .setZone(DHAKA_TZ)
        .setLocale('bn')
        .toFormat('d MMMM yyyy, HH:mm'),
      report,
    });
    const content = await this.pdf.render(html);
    await this.audit.log({
      actorId: actor.id,
      action: AuditAction.OFFICE_REPORT_EXPORTED,
      entityType: 'report',
      entityId: null,
      after: {
        period: p.period,
        from: p.range.start.toISOString(),
        to: p.range.end.toISOString(),
        wingId: ctx.wing?.id ?? null,
        officerId: ctx.officer?.id ?? null,
        status: query.status ?? null,
        organizerWingId: query.organizerWingId ?? null,
        chair: query.chair ?? null,
        role: query.role ?? null,
        page: report.meetings.page,
        rows: report.meetings.items.length,
      },
      ip,
    });
    return { filename: `office-report-${p.fileKey}.pdf`, content };
  }

  // ---------------------------------------------------------------- scope

  private async context(
    actor: AuthUser,
    query: OfficeReportQueryDto,
  ): Promise<OfficeContext> {
    const access = await this.officeScope.access(actor);
    if (access.scope === OfficeReportScope.NONE)
      throw new ForbiddenException(OFFICE_REPORT_MESSAGES.forbidden);
    const scope = access.scope;

    let wingId = query.wingId ?? null;
    // v1.16: WING viewers see their own wing and the wings of their WING-scope additional
    // charges — one of them at a time (the first by default), never another one.
    const allowed = access.wings.map((w) => w.id);
    if (scope === OfficeReportScope.WING) {
      if (allowed.length === 0)
        throw new ForbiddenException(OFFICE_REPORT_MESSAGES.noWing);
      if (
        (wingId && !allowed.includes(wingId)) ||
        (query.organizerWingId && !allowed.includes(query.organizerWingId))
      )
        throw new ForbiddenException(OFFICE_REPORT_MESSAGES.outOfScope);
      wingId = wingId ?? allowed[0];
    }
    const wing = wingId
      ? await this.dataSource.getRepository(Wing).findOneBy({ id: wingId })
      : null;
    if (wingId && !wing)
      throw new NotFoundException(OFFICE_REPORT_MESSAGES.wingNotFound);

    const officer = query.officerId
      ? await this.dataSource.getRepository(User).findOne({
          where: { id: query.officerId },
          relations: { designation: true, wing: true },
        })
      : null;
    if (query.officerId && !officer)
      throw new NotFoundException(OFFICE_REPORT_MESSAGES.officerNotFound);
    if (
      officer &&
      scope === OfficeReportScope.WING &&
      !(officer.wingId && allowed.includes(officer.wingId))
    )
      throw new ForbiddenException(OFFICE_REPORT_MESSAGES.outOfScope);

    return {
      scope,
      wing,
      officer,
      topWingId: wing?.id ?? null,
      scopeWings: scope === OfficeReportScope.WING ? access.wings : [],
    };
  }

  // ---------------------------------------------------------------- data

  private async build(
    actor: AuthUser,
    query: OfficeReportQueryDto,
  ): Promise<OfficeData> {
    const p = resolveReportQuery(query);
    const ctx = await this.context(actor, query);
    const all = await this.load(p.range, ctx);
    const office = ctx.scope === OfficeReportScope.OFFICE;
    const officerId = ctx.officer?.id ?? null;

    const listed = filterMeetings(
      all,
      {
        status: query.status,
        organizerWingId: office ? query.organizerWingId : undefined,
        chair: query.chair,
        role: officerId ? query.role : undefined,
      },
      officerId,
    );
    const pageItems = listed
      .slice(query.skip, query.skip + query.limit)
      .map((m) => toRow(m, actor.id, officerId));

    const report: OfficeReportDto = {
      period: {
        period: p.period,
        date: p.date,
        labelBn: p.labelBn,
        from: p.range.start,
        to: p.range.end,
      },
      scope: ctx.scope,
      scopeWings: ctx.scopeWings,
      wing: ctx.wing
        ? { id: ctx.wing.id, nameBn: ctx.wing.nameBn, nameEn: ctx.wing.nameEn }
        : null,
      officer: ctx.officer
        ? {
            id: ctx.officer.id,
            nameBn: ctx.officer.nameBn,
            nameEn: ctx.officer.nameEn,
            designationBn: ctx.officer.designation?.nameBn ?? null,
            designationEn: ctx.officer.designation?.nameEn ?? null,
            wingBn: ctx.officer.wing?.nameBn ?? null,
            wingEn: ctx.officer.wing?.nameEn ?? null,
          }
        : null,
      cards: officeCards(all),
      wings: office && !ctx.wing && !ctx.officer ? wingRows(all) : null,
      topParticipants: topParticipants(all, ctx.topWingId),
      busiestDays: busiestDays(all),
      filterOptions: {
        organizerWings: office
          ? organizerWingOptions(all).map((w) => ({ ...w }))
          : [],
        chairs: chairOptions(all),
      },
      meetings: paginated(pageItems, listed.length, query),
    };
    return { p, ctx, report };
  }

  /**
   * Meetings STARTING in the range: an officer's meetings (every role, every wing), else those
   * organized by an officer of the wing, else all; with chair, guests and the officer rows.
   */
  private async load(
    range: DateRange,
    ctx: OfficeContext,
  ): Promise<OfficeMeeting[]> {
    const qb = this.dataSource
      .getRepository(Meeting)
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
    if (ctx.officer) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp."meetingId" = m.id AND mp."userId" = :officerId)',
        { officerId: ctx.officer.id },
      );
    } else if (ctx.wing) {
      qb.andWhere('o.wingId = :wingId', { wingId: ctx.wing.id });
    }
    const rows = await qb.getMany();
    const people = await this.people(rows.map((m) => m.id));

    return rows.map((m) => {
      const guestChair = m.guests.find((g) => g.isChair);
      return {
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
        myRole: null,
        chairId: m.chairId,
        chairNameBn: m.chair?.nameBn ?? guestChair?.name ?? null,
        chairNameEn: m.chair?.nameEn ?? guestChair?.name ?? null,
        chairDesignationBn: m.chair
          ? (m.chair.designation?.nameBn ?? null)
          : (guestChair?.designation ?? null),
        chairDesignationEn: m.chair
          ? (m.chair.designation?.nameEn ?? null)
          : (guestChair?.designation ?? null),
        chairKey: m.chairId
          ? `user:${m.chairId}`
          : guestChair
            ? `guest:${guestChair.name}`
            : null,
        guests: m.guests.map((g) => ({
          name: g.name,
          designation: g.designation,
        })),
        decisionFileCount: m.decisionFileCount ?? 0,
        hasNotice: (m.noticeFileCount ?? 0) > 0,
        people: people.get(m.id) ?? [],
      };
    });
  }

  /** The officer rows (organizer, chair, members) of the meetings, with designation and wing. */
  private async people(ids: string[]): Promise<Map<string, OfficePerson[]>> {
    const result = new Map<string, OfficePerson[]>();
    if (ids.length === 0) return result;
    const rows = await this.dataSource.getRepository(MeetingParticipant).find({
      where: { meetingId: In(ids) },
      relations: { user: { designation: true, wing: true } },
    });
    for (const r of rows) {
      const list = result.get(r.meetingId) ?? [];
      list.push({
        userId: r.userId,
        role: r.role,
        nameBn: r.user.nameBn,
        nameEn: r.user.nameEn,
        designationBn: r.user.designation?.nameBn ?? null,
        designationEn: r.user.designation?.nameEn ?? null,
        wingId: r.user.wingId,
        wingBn: r.user.wing?.nameBn ?? null,
        wingEn: r.user.wing?.nameEn ?? null,
      });
      result.set(r.meetingId, list);
    }
    return result;
  }
}

function toRow(
  m: OfficeMeeting,
  viewerId: string,
  officerId: string | null,
): OfficeMeetingRowDto {
  return {
    id: m.id,
    title: m.title,
    startAt: m.startAt,
    endAt: m.endAt,
    room: m.room,
    status: m.status,
    organizerWingBn: m.organizerWingBn,
    organizerWingEn: m.organizerWingEn,
    organizerDesignationBn: m.organizerDesignationBn,
    organizerDesignationEn: m.organizerDesignationEn,
    chairNameBn: m.chairNameBn,
    chairNameEn: m.chairNameEn,
    chairDesignationBn: m.chairDesignationBn ?? null,
    chairDesignationEn: m.chairDesignationEn,
    myRole: roleOf(m, viewerId),
    officerRole: officerId ? roleOf(m, officerId) : null,
    decisionFileCount: m.decisionFileCount ?? 0,
    hasNotice: m.hasNotice ?? false,
  };
}

/** "জনাব [name], [designation] · [wing]" for the PDF header line কর্মকর্তা ফিল্টার. */
export function officerLineBn(officer: {
  nameBn: string;
  designation?: { nameBn: string } | null;
  wing?: { nameBn: string } | null;
}): string {
  const head = [withJanab(officer.nameBn), officer.designation?.nameBn]
    .filter(Boolean)
    .join(', ');
  return [head, officer.wing?.nameBn].filter(Boolean).join(' · ');
}
