import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { REPORT_PERIODS, type ReportPeriod } from '../../../common/utils/time';
import type { ReportRangeKind } from '../report-period';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../../meetings/enums/participant-role.enum';

const DATE_MESSAGE = 'তারিখ YYYY-MM-DD আকারে দিন (যেমন 2026-12-01)।';
/** v1.15: "fiscal-year" was removed; old calls get this 400 (code PERIOD_INVALID). */
const PERIOD_MESSAGE =
  'period day, week, month অথবা year হতে হবে। fiscal-year আর সমর্থিত নয়।';

/** ?period=&date= — shared by JSON and PDF reports. */
export class ReportPeriodQueryDto {
  @ApiPropertyOptional({
    enum: REPORT_PERIODS,
    default: 'month',
    description: 'Week = Sunday–Saturday, year = January–December (Asia/Dhaka)',
  })
  @IsOptional()
  @IsIn(REPORT_PERIODS, {
    message: PERIOD_MESSAGE,
  })
  period: ReportPeriod = 'month';

  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'Any day inside the period (default: today in Dhaka)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  date?: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description:
      'v1.15 custom range: first day (YYYY-MM-DD, Asia/Dhaka, inclusive). Together with `to` it replaces period/date; at most 2 years.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-15',
    description:
      'v1.15 custom range: last day (YYYY-MM-DD, Asia/Dhaka, inclusive); not before `from`.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  to?: string;
}

/** JSON reports also page through the meeting list. */
export class ReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_PERIODS, default: 'month' })
  @IsOptional()
  @IsIn(REPORT_PERIODS, {
    message: PERIOD_MESSAGE,
  })
  period: ReportPeriod = 'month';

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  date?: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description:
      'v1.15 custom range: first day (YYYY-MM-DD, Asia/Dhaka, inclusive). Together with `to` it replaces period/date; at most 2 years.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-15',
    description:
      'v1.15 custom range: last day (YYYY-MM-DD, Asia/Dhaka, inclusive); not before `from`.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  to?: string;
}

export class PeriodDto {
  @ApiProperty({
    enum: [...REPORT_PERIODS, 'custom'],
    example: 'month',
    description: '`custom` = a date range chosen with from / to (v1.15)',
  })
  period!: ReportRangeKind;

  @ApiProperty({
    example: '2026-12-01',
    description: 'Reference day; for a custom range its first day',
  })
  date!: string;

  @ApiProperty({ example: 'ডিসেম্বর ২০২৬' })
  labelBn!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Inclusive start (UTC)',
  })
  from!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Exclusive end (UTC)',
  })
  to!: Date;
}

export class StatusCountsDto {
  @ApiProperty({ example: 3 }) SCHEDULED!: number;
  @ApiProperty({ example: 12 }) COMPLETED!: number;
  @ApiProperty({ example: 1 }) CANCELLED!: number;
}

export class DayCountDto {
  @ApiProperty({ example: '2026-12-01' }) date!: string;
  @ApiProperty({ example: 2 }) meetings!: number;
  @ApiProperty({ example: 3.5 }) hours!: number;
}

export class ReportGuestDto {
  @ApiProperty({ example: 'ড. ফারহানা ইসলাম' }) name!: string;
  @ApiProperty({ example: 'যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয়' })
  designation!: string;
}

export class ReportMeetingDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'বার্ষিক উন্নয়ন কর্মসূচি পর্যালোচনা সভা' })
  title!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endAt!: Date;
  @ApiProperty({ type: String, nullable: true, example: 'সম্মেলন কক্ষ' })
  room!: string | null;
  @ApiProperty({ enum: MeetingStatus }) status!: MeetingStatus;
  @ApiProperty({ example: 'মোঃ ফিরোজ সরকার' }) organizerNameBn!: string;
  @ApiProperty({ example: 'Md. Firoz Sarker' }) organizerNameEn!: string;
  @ApiProperty({ type: String, nullable: true, example: 'সচিব' })
  organizerDesignationBn!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Secretary' })
  organizerDesignationEn!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'কম্পিউটার উইং',
    description:
      "Organizer's current wing (v1.9: displayed as the organizer; null → designation)",
  })
  organizerWingBn!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Computer Wing' })
  organizerWingEn!: string | null;
  @ApiProperty({
    enum: ParticipantRole,
    nullable: true,
    description:
      "The viewer's role in this meeting (personal report: the officer's role; office report since v1.10: the admin's own role, null when they are not one of its people)",
  })
  myRole!: ParticipantRole | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'মোঃ ফিরোজ সরকার',
    description: 'Chair: the internal chair, else the guest chair',
  })
  chairNameBn!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Md. Firoz Sarker',
    description:
      "Internal chair's English name; a guest chair's name as typed (v1.7)",
  })
  chairNameEn!: string | null;
  @ApiProperty({
    type: [ReportGuestDto],
    description: 'Guest officers (listed only, never counted)',
  })
  guests!: ReportGuestDto[];
  @ApiProperty({
    example: 0,
    description: 'v1.11: number of decision files ("সভা কার্যবিবরণী")',
  })
  decisionFileCount!: number;
  @ApiProperty({
    example: false,
    description: 'v1.13: the meeting has an uploaded notice ("সভার নোটিশ")',
  })
  hasNotice!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'application/pdf',
    description:
      'v1.17: mime type of the uploaded notice (null = none). PDF / image → "নোটিশ দেখুন" (file viewer); DOCX → "নোটিশ ডাউনলোড"',
  })
  noticeMime!: string | null;

  @ApiProperty({
    example: true,
    description:
      'v1.17: at least one minutes file is a PDF or an image → row menu "কার্যবিবরণী দেখুন" (file viewer); with files but false (DOCX only) → "কার্যবিবরণী ডাউনলোড"',
  })
  decisionViewable!: boolean;
}

export class ReportMeetingPageDto {
  @ApiProperty({ type: [ReportMeetingDto] }) items!: ReportMeetingDto[];
  @ApiProperty({ example: 16 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 1 }) totalPages!: number;
}

export class PersonalSummaryDto {
  @ApiProperty({ example: 16 }) totalMeetings!: number;
  @ApiProperty({ example: 5 }) organized!: number;
  @ApiProperty({ example: 11 }) attended!: number;
  @ApiProperty({ type: StatusCountsDto }) byStatus!: StatusCountsDto;
  @ApiProperty({
    example: 21.5,
    description: 'Cancelled meetings are not counted',
  })
  totalHours!: number;
  @ApiProperty({
    example: 2,
    description: 'Conflicts where a higher meeting overrode one of my meetings',
  })
  conflictsRaisedAgainstMyMeetings!: number;
  @ApiProperty({
    example: 1,
    description: 'Conflicts my meetings raised against lower meetings',
  })
  conflictsIRaised!: number;
  @ApiProperty({ type: [DayCountDto] }) byDay!: DayCountDto[];
}

export class ReportOfficerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'মোঃ ফিরোজ সরকার' }) nameBn!: string;
  @ApiProperty({ example: 'Md. Firoz Sarker' }) nameEn!: string;
  @ApiProperty({ type: String, nullable: true, example: 'সচিব' })
  designationBn!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Secretary' })
  designationEn!: string | null;
}

export class PersonalReportDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;
  @ApiProperty({ type: ReportOfficerDto }) officer!: ReportOfficerDto;
  @ApiProperty({ type: PersonalSummaryDto }) summary!: PersonalSummaryDto;
  @ApiProperty({ type: ReportMeetingPageDto }) meetings!: ReportMeetingPageDto;
}
