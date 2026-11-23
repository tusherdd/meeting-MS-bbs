import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { OfficeReportScope } from '../../designations/enums/office-report-scope.enum';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../../meetings/enums/participant-role.enum';
import { DayCountDto, PeriodDto, ReportQueryDto } from './report.dto';

/**
 * v1.15 office report "অফিস রিপোর্ট" (SPEC.md §6.10): the same query for the page (JSON) and the PDF,
 * so the PDF holds exactly the rows on screen (same filters, same page).
 */
export class OfficeReportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'উইং: OFFICE viewers choose any wing (empty = সকল উইং); WING viewers always see their own wing (another one → 403)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ উইং আইডি।' })
  wingId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "কর্মকর্তা: that officer's meetings in every role and every wing (WING viewers: only officers of their own wing)",
  })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ কর্মকর্তা আইডি।' })
  officerId?: string;

  @ApiPropertyOptional({
    enum: MeetingStatus,
    description: 'Meeting list filter অবস্থা',
  })
  @IsOptional()
  @IsEnum(MeetingStatus, {
    message: 'status SCHEDULED, COMPLETED অথবা CANCELLED হতে হবে।',
  })
  status?: MeetingStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Meeting list filter আয়োজক উইং (OFFICE viewers only)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ উইং আইডি।' })
  organizerWingId?: string;

  @ApiPropertyOptional({
    example: 'user:7b0c2f0e-1f7a-4c55-9a51-0d1f3c1b9e11',
    description:
      'Meeting list filter সভাপতি: a `key` from `filterOptions.chairs` ("user:<id>" or "guest:<name>")',
  })
  @IsOptional()
  @MaxLength(260, { message: 'সভাপতি ফিল্টার সঠিক নয়।' })
  @Matches(/^(user:[0-9a-f-]{36}|guest:.{1,200})$/su, {
    message: 'সভাপতি ফিল্টার সঠিক নয়।',
  })
  chair?: string;

  @ApiPropertyOptional({
    enum: ParticipantRole,
    description:
      "Meeting list filter ভূমিকা: the selected officer's role (only with officerId)",
  })
  @IsOptional()
  @IsEnum(ParticipantRole, {
    message: 'role ORGANIZER, CHAIR অথবা MEMBER হতে হবে।',
  })
  role?: ParticipantRole;
}

export class OfficeWingRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'কম্পিউটার উইং' }) nameBn!: string;
  @ApiProperty({ type: String, nullable: true, example: 'Computer Wing' })
  nameEn!: string | null;
}

export class OfficeOfficerRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ type: String, nullable: true }) designationBn!: string | null;
  @ApiProperty({ type: String, nullable: true }) designationEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) wingBn!: string | null;
  @ApiProperty({ type: String, nullable: true }) wingEn!: string | null;
}

export class OfficeCardsDto {
  @ApiProperty({ example: 42, description: 'মোট সভা (all statuses)' })
  total!: number;
  @ApiProperty({ example: 12, description: 'চলমান (SCHEDULED)' })
  scheduled!: number;
  @ApiProperty({ example: 26 }) completed!: number;
  @ApiProperty({ example: 4 }) cancelled!: number;
  @ApiProperty({
    example: 63,
    description: 'মোট ঘণ্টা (cancelled meetings excluded)',
  })
  hours!: number;
}

export class OfficeWingRowDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  id!: string | null;
  @ApiProperty({ example: 'কম্পিউটার উইং' }) nameBn!: string;
  @ApiProperty({ type: String, nullable: true }) nameEn!: string | null;
  @ApiProperty({ example: 12 }) meetings!: number;
  @ApiProperty({ example: 8 }) completed!: number;
  @ApiProperty({ example: 1 }) cancelled!: number;
  @ApiProperty({ example: 18 }) hours!: number;
}

export class OfficeParticipantRowDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ type: String, nullable: true }) designationBn!: string | null;
  @ApiProperty({ type: String, nullable: true }) designationEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) wingBn!: string | null;
  @ApiProperty({ type: String, nullable: true }) wingEn!: string | null;
  @ApiProperty({ example: 18 }) meetings!: number;
  @ApiProperty({ example: 27 }) hours!: number;
}

export class OfficeChairOptionDto {
  @ApiProperty({ example: 'user:7b0c2f0e-1f7a-4c55-9a51-0d1f3c1b9e11' })
  key!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ type: String, nullable: true }) designationBn!: string | null;
  @ApiProperty({ type: String, nullable: true }) designationEn!: string | null;
}

export class OfficeFilterOptionsDto {
  @ApiProperty({
    type: [OfficeWingRefDto],
    description: 'আয়োজক উইং options (empty for WING viewers)',
  })
  organizerWings!: OfficeWingRefDto[];
  @ApiProperty({ type: [OfficeChairOptionDto] })
  chairs!: OfficeChairOptionDto[];
}

export class OfficeMeetingRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) endAt!: Date;
  @ApiProperty({ type: String, nullable: true }) room!: string | null;
  @ApiProperty({ enum: MeetingStatus }) status!: MeetingStatus;
  @ApiProperty({ type: String, nullable: true, example: 'কম্পিউটার উইং' })
  organizerWingBn!: string | null;
  @ApiProperty({ type: String, nullable: true }) organizerWingEn!:
    string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Organizer's designation (shown when the organizer has no wing)",
  })
  organizerDesignationBn!: string | null;
  @ApiProperty({ type: String, nullable: true })
  organizerDesignationEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) chairNameBn!: string | null;
  @ApiProperty({ type: String, nullable: true }) chairNameEn!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'মহাপরিচালক',
    description: 'সভাপতি column: the chair’s designation',
  })
  chairDesignationBn!: string | null;
  @ApiProperty({ type: String, nullable: true })
  chairDesignationEn!: string | null;
  @ApiProperty({
    enum: ParticipantRole,
    nullable: true,
    description:
      "The VIEWER's role (row menu: Edit / বাতিল করুন only for the organizer or the chair)",
  })
  myRole!: ParticipantRole | null;
  @ApiProperty({
    enum: ParticipantRole,
    nullable: true,
    description:
      "ভূমিকা column: the selected officer's role (null without officerId)",
  })
  officerRole!: ParticipantRole | null;
  @ApiProperty({
    example: 0,
    description: 'Minutes files ("কার্যবিবরণী দেখুন")',
  })
  decisionFileCount!: number;
  @ApiProperty({
    example: false,
    description: 'Uploaded notice ("সভার নোটিশ")',
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

export class OfficeMeetingPageDto {
  @ApiProperty({ type: [OfficeMeetingRowDto] }) items!: OfficeMeetingRowDto[];
  @ApiProperty({ example: 16 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 1 }) totalPages!: number;
}

export class OfficeReportDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;

  @ApiProperty({
    enum: [OfficeReportScope.WING, OfficeReportScope.OFFICE],
    description: "The viewer's scope",
  })
  scope!: OfficeReportScope;

  @ApiProperty({
    type: [OfficeWingRefDto],
    description:
      'v1.16 WING viewers: the wings they may choose (own wing first, then the wings of their WING-scope additional charges); empty for OFFICE',
  })
  scopeWings!: OfficeWingRefDto[];

  @ApiProperty({
    type: OfficeWingRefDto,
    nullable: true,
    description:
      'The wing filter: the chosen wing (OFFICE: any; WING: one of scopeWings, default the first); null = সকল উইং',
  })
  wing!: OfficeWingRefDto | null;

  @ApiProperty({ type: OfficeOfficerRefDto, nullable: true })
  officer!: OfficeOfficerRefDto | null;

  @ApiProperty({ type: OfficeCardsDto }) cards!: OfficeCardsDto;

  @ApiProperty({
    type: [OfficeWingRowDto],
    nullable: true,
    description:
      'উইংভিত্তিক তালিকা (by the organizer’s wing); null when hidden (WING viewer, a wing or an officer selected)',
  })
  wings!: OfficeWingRowDto[] | null;

  @ApiProperty({ type: [OfficeParticipantRowDto] })
  topParticipants!: OfficeParticipantRowDto[];

  @ApiProperty({ type: [DayCountDto] }) busiestDays!: DayCountDto[];

  @ApiProperty({ type: OfficeFilterOptionsDto })
  filterOptions!: OfficeFilterOptionsDto;

  @ApiProperty({ type: OfficeMeetingPageDto }) meetings!: OfficeMeetingPageDto;
}
