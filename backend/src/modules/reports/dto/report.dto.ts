import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { REPORT_PERIODS, type ReportPeriod } from '../../../common/utils/time';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../../meetings/enums/participant-role.enum';

const DATE_MESSAGE = 'তারিখ YYYY-MM-DD আকারে দিন (যেমন 2026-12-01)।';

/** ?period=&date= — shared by JSON and PDF reports. */
export class ReportPeriodQueryDto {
  @ApiPropertyOptional({
    enum: REPORT_PERIODS,
    default: 'month',
    description: 'Week = Sunday–Saturday; fiscal-year = July–June (Asia/Dhaka)',
  })
  @IsOptional()
  @IsIn(REPORT_PERIODS, {
    message: 'period day, week, month, year অথবা fiscal-year হতে হবে।',
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
}

export class OfficeFilterDto extends ReportPeriodQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: "Organizer's wing" })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ উইং আইডি।' })
  wingId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "Organizer's designation",
  })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ পদবি আইডি।' })
  designationId?: string;
}

/** JSON reports also page through the meeting list. */
export class ReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_PERIODS, default: 'month' })
  @IsOptional()
  @IsIn(REPORT_PERIODS, {
    message: 'period day, week, month, year অথবা fiscal-year হতে হবে।',
  })
  period: ReportPeriod = 'month';

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  date?: string;
}

export class OfficeReportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ উইং আইডি।' })
  wingId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ পদবি আইডি।' })
  designationId?: string;
}

// ------------------------------------------------------------------ responses

export class PeriodDto {
  @ApiProperty({ enum: REPORT_PERIODS, example: 'month' })
  period!: ReportPeriod;

  @ApiProperty({ example: '2026-12-01' })
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
  @ApiProperty({ type: String, nullable: true, example: 'সচিব' })
  organizerDesignationBn!: string | null;
  @ApiProperty({
    enum: ParticipantRole,
    nullable: true,
    description: 'Personal report only',
  })
  myRole!: ParticipantRole | null;
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
  @ApiProperty({ type: String, nullable: true, example: 'সচিব' })
  designationBn!: string | null;
}

export class PersonalReportDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;
  @ApiProperty({ type: ReportOfficerDto }) officer!: ReportOfficerDto;
  @ApiProperty({ type: PersonalSummaryDto }) summary!: PersonalSummaryDto;
  @ApiProperty({ type: ReportMeetingPageDto }) meetings!: ReportMeetingPageDto;
}

export class GroupCountDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) id!:
    string | null;
  @ApiProperty({ example: 'কম্পিউটার উইং' }) nameBn!: string;
  @ApiProperty({ example: 7 }) meetings!: number;
  @ApiProperty({ example: 9.5 }) hours!: number;
}

export class DesignationCountDto extends GroupCountDto {
  @ApiProperty({ type: Number, nullable: true, example: 6 }) priority!:
    number | null;
}

export class OrganizerCountDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ example: 'আকলিমা খাতুন' }) nameBn!: string;
  @ApiProperty({ type: String, nullable: true, example: 'উপপরিচালক' })
  designationBn!: string | null;
  @ApiProperty({ example: 4 }) meetings!: number;
  @ApiProperty({ example: 6 }) hours!: number;
}

export class ConflictCountsDto {
  @ApiProperty({ example: 2 }) pending!: number;
  @ApiProperty({ example: 9 }) resolved!: number;
}

export class OfficeSummaryDto {
  @ApiProperty({ example: 120 }) totalMeetings!: number;
  @ApiProperty({ type: StatusCountsDto }) byStatus!: StatusCountsDto;
  @ApiProperty({ example: 180.5 }) totalHours!: number;
  @ApiProperty({
    type: [GroupCountDto],
    description: "By the organizer's wing",
  })
  byWing!: GroupCountDto[];
  @ApiProperty({
    type: [DesignationCountDto],
    description: "By the organizer's designation, priority order",
  })
  byDesignation!: DesignationCountDto[];
  @ApiProperty({ type: [OrganizerCountDto], description: 'Top 10 organizers' })
  topOrganizers!: OrganizerCountDto[];
  @ApiProperty({ type: ConflictCountsDto }) conflicts!: ConflictCountsDto;
  @ApiProperty({
    type: [DayCountDto],
    description: 'Top 5 days by number of meetings',
  })
  busiestDays!: DayCountDto[];
}

export class OfficeFiltersDto {
  @ApiProperty({ type: String, nullable: true, example: 'কম্পিউটার উইং' })
  wingBn!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'উপপরিচালক' })
  designationBn!: string | null;
}

export class OfficeReportDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;
  @ApiProperty({ type: OfficeFiltersDto }) filters!: OfficeFiltersDto;
  @ApiProperty({ type: OfficeSummaryDto }) summary!: OfficeSummaryDto;
  @ApiProperty({ type: ReportMeetingPageDto }) meetings!: ReportMeetingPageDto;
}
