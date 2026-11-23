import { ApiProperty } from '@nestjs/swagger';
import { WingRefDto } from '../../users/dto/user-response.dto';
import { ConflictStatus } from '../enums/conflict-status.enum';
import { MeetingStatus } from '../enums/meeting-status.enum';
import { ParticipantRole } from '../enums/participant-role.enum';
import { DecisionStatus } from '../../decisions/decision-rules';
import type { BlockedRole } from '../meeting-rules';
import { NoticeFileDto } from '../../notices/dto/notice.dto';

export class DesignationBriefDto {
  @ApiProperty({ example: 'উপপরিচালক' })
  nameBn!: string;

  @ApiProperty({ example: 'Deputy Director' })
  nameEn!: string;

  @ApiProperty({ example: 6 })
  priority!: number;
}

export class PersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' })
  nameBn!: string;

  @ApiProperty({ example: 'Md. Rahim Uddin' })
  nameEn!: string;

  @ApiProperty({ type: DesignationBriefDto, nullable: true })
  designation!: DesignationBriefDto | null;
}

/**
 * The organizer (v1.9, SPEC.md §13.17): the person (for permissions and admin pages) plus their
 * CURRENT wing, which is what user pages display ("আয়োজক" = wing, or the designation without one).
 */
export class OrganizerDto extends PersonDto {
  @ApiProperty({
    type: WingRefDto,
    nullable: true,
    description:
      "Organizer's current wing (displayed as the organizer; null → show the designation)",
  })
  wing!: WingRefDto | null;
}

export class ParticipantDto extends PersonDto {
  @ApiProperty({ enum: ParticipantRole, example: ParticipantRole.MEMBER })
  role!: ParticipantRole;

  @ApiProperty({ type: WingRefDto, nullable: true })
  wing!: WingRefDto | null;
}

export class MeetingSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'বার্ষিক উন্নয়ন কর্মসূচি পর্যালোচনা সভা' })
  title!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endAt!: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'সম্মেলন কক্ষ, ৫ম তলা',
  })
  room!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://meet.google.com/abc-defg-hij',
  })
  onlineLink!: string | null;

  @ApiProperty({ enum: MeetingStatus })
  status!: MeetingStatus;

  @ApiProperty({
    example: 6,
    description:
      "Snapshot: the internal chair's designation priority, else the organizer's (taken on create and when the chair changes). Never shown in the UI.",
  })
  priority!: number;

  @ApiProperty({ type: OrganizerDto })
  organizer!: OrganizerDto;

  @ApiProperty({
    enum: ParticipantRole,
    nullable: true,
    description: 'My role in this meeting (null = admin view)',
  })
  myRole!: ParticipantRole | null;

  @ApiProperty({
    example: 0,
    description: 'v1.11: number of decision files ("সভা কার্যবিবরণী")',
  })
  decisionFileCount!: number;

  @ApiProperty({
    enum: DecisionStatus,
    enumName: 'DecisionStatus',
    nullable: true,
    description:
      'v1.11: COMPLETE = at least one decision file; PENDING = started or completed, not cancelled, no file; null = cancelled or not started',
  })
  decisionStatus!: DecisionStatus | null;

  @ApiProperty({
    example: false,
    description:
      'v1.13: the meeting has an uploaded notice "সভার নোটিশ" (GET /meetings/:id/notice)',
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

export class ConflictMeetingRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'অন্য একটি সভা',
    description: 'Real title only for its people and admins',
  })
  title!: string;

  @ApiProperty({
    example: true,
    description:
      'true = the real title is hidden from you and `title` holds the placeholder (v1.6: clients show their own text)',
  })
  titleHidden!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endAt!: Date;

  @ApiProperty({ example: 1 })
  priority!: number;

  @ApiProperty({ enum: MeetingStatus })
  status!: MeetingStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'সচিব',
    description: "Organizer's designation (Bangla)",
  })
  organizerDesignation!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Deputy Director',
    description: "Organizer's designation (English, v1.7)",
  })
  organizerDesignationEn!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'কম্পিউটার উইং',
    description:
      "Organizer's current wing (Bangla, v1.9; displayed as the organizer, null → designation)",
  })
  organizerWing!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Computer Wing',
    description: "Organizer's current wing (English, v1.9)",
  })
  organizerWingEn!: string | null;

  @ApiProperty({
    example: false,
    description:
      'True when the current user organizes this meeting (may cancel/reschedule it)',
  })
  organizedByMe!: boolean;

  @ApiProperty({
    example: false,
    description:
      'True when the current user is the internal chair of this meeting (v1.10: may edit/cancel it)',
  })
  chairedByMe!: boolean;

  @ApiProperty({
    example: false,
    description: 'v1.13: the meeting has an uploaded notice "সভার নোটিশ"',
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
}

export class OfficerRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'মোঃ করিম' })
  nameBn!: string;

  @ApiProperty({ example: 'Md. Karim Uddin' })
  nameEn!: string;
}

export class MeetingConflictDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ConflictStatus })
  status!: ConflictStatus;

  @ApiProperty({
    enum: ['HIGHER', 'LOWER'],
    description: 'HIGHER = this meeting overrode the other one',
  })
  relation!: 'HIGHER' | 'LOWER';

  @ApiProperty({ type: ConflictMeetingRefDto })
  otherMeeting!: ConflictMeetingRefDto;

  @ApiProperty({ type: OfficerRefDto })
  officer!: OfficerRefDto;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: Date | null;
}

/** A guest officer of the meeting (অতিথি কর্মকর্তা, no account). */
export class MeetingGuestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ড. ফারহানা ইসলাম' })
  name!: string;

  @ApiProperty({ example: 'যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয়' })
  designation!: string;

  @ApiProperty({ example: 'farhana@plancomm.gov.bd' })
  email!: string;

  @ApiProperty({ example: false, description: 'This guest chairs the meeting' })
  isChair!: boolean;
}

export class MeetingDetailDto extends MeetingSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  agenda!: string | null;

  @ApiProperty({
    type: PersonDto,
    nullable: true,
    description:
      'Internal chair (null when the chair is a guest, see guests[].isChair)',
  })
  chair!: PersonDto | null;

  @ApiProperty({
    type: [MeetingGuestDto],
    description: 'Guest officers (chair first, then by name)',
  })
  guests!: MeetingGuestDto[];

  @ApiProperty({
    type: [ParticipantDto],
    description: 'Everyone incl. organizer and chair',
  })
  participants!: ParticipantDto[];

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: [MeetingConflictDto] })
  conflicts!: MeetingConflictDto[];

  @ApiProperty({
    type: NoticeFileDto,
    nullable: true,
    description:
      'v1.13: the uploaded notice "সভার নোটিশ" (null = none); `canManage` = I may replace / remove it',
  })
  notice!: NoticeFileDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ClashOrganizerDto {
  @ApiProperty({ example: 'মোঃ করিম উদ্দিন', description: 'Bangla name' })
  name!: string;

  @ApiProperty({
    example: 'Md. Karim Uddin',
    description: 'English name (v1.7)',
  })
  nameEn!: string;

  @ApiProperty({ type: String, nullable: true, example: 'উপপরিচালক' })
  designation!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Deputy Director' })
  designationEn!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'কম্পিউটার উইং',
    description:
      'Current wing (Bangla, v1.9; displayed as the organizer, null → designation)',
  })
  wing!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Computer Wing',
    description: 'Current wing (English, v1.9)',
  })
  wingEn!: string | null;
}

export class ClashDto {
  @ApiProperty({ format: 'uuid' })
  meetingId!: string;

  @ApiProperty({
    example: 'অন্য একটি সভা',
    description: 'Real title only if you are one of its people or an admin',
  })
  title!: string;

  @ApiProperty({
    example: true,
    description:
      'true = the real title is hidden from you and `title` holds the placeholder (v1.6: clients show their own text)',
  })
  titleHidden!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endAt!: Date;

  @ApiProperty({ example: 6 })
  priority!: number;

  @ApiProperty({ type: ClashOrganizerDto })
  organizer!: ClashOrganizerDto;

  @ApiProperty({
    type: [OfficerRefDto],
    description: 'Officers who are in both meetings',
  })
  sharedOfficers!: OfficerRefDto[];

  @ApiProperty({
    enum: ['ORGANIZER', 'CHAIR'],
    enumName: 'BlockedRole',
    isArray: true,
    example: ['CHAIR'],
    description:
      'v1.13: on blocking clashes, which lead of THIS meeting (its organizer and/or its internal chair) already organizes or chairs the other meeting; empty on warnings',
  })
  blockedBy!: BlockedRole[];
}

/** 409 body of POST/PATCH /meetings when the lead rule blocks (SPEC.md §6.4, v1.12/v1.13). */
export class MeetingConflictErrorDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({
    example: 'আয়োজক একই সময়ে আরেকটি সভার আয়োজক বা সভাপতি।',
    description:
      'Bangla by default; English with Accept-Language: en. Organizer busy: "The organizer is already the organizer or chair of another meeting at this time." ' +
      '(TIME_CONFLICT_BLOCKING); only the chair busy (v1.13): "The chair is already the organizer or chair of another meeting at this time." (TIME_CONFLICT_CHAIR_BLOCKING)',
  })
  message!: string;

  @ApiProperty({ example: 'Conflict' })
  error!: string;

  @ApiProperty({
    type: [ClashDto],
    description:
      'Meetings where the organizer or the internal chair is already the organizer or internal chair at this time',
  })
  blocking!: ClashDto[];

  @ApiProperty({
    example: 'TIME_CONFLICT_BLOCKING',
    description:
      'Stable message code (v1.6): TIME_CONFLICT_BLOCKING or TIME_CONFLICT_CHAIR_BLOCKING (v1.13)',
  })
  code!: string;
}

export class CheckConflictsResponseDto {
  @ApiProperty({ example: false, description: 'false = saving would give 409' })
  allowed!: boolean;

  @ApiProperty({
    type: [ClashDto],
    description:
      'Blocking clashes (v1.12): the organizer is the organizer or internal chair of these overlapping meetings. Saving gives 409.',
  })
  blocking!: ClashDto[];

  @ApiProperty({
    type: [ClashDto],
    description:
      'Warnings (v1.12): overlapping meetings that share an officer, whatever the priorities. Saving works; concurrent-meeting records are kept and the people concerned are informed.',
  })
  warnings!: ClashDto[];
}

export class ConflictListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ConflictStatus })
  status!: ConflictStatus;

  @ApiProperty({
    type: OfficerRefDto,
    description: 'The officer who is in both meetings',
  })
  officer!: OfficerRefDto;

  @ApiProperty({
    type: ConflictMeetingRefDto,
    description: 'The higher-priority meeting',
  })
  higherMeeting!: ConflictMeetingRefDto;

  @ApiProperty({
    type: ConflictMeetingRefDto,
    description: 'The meeting asked to cancel/reschedule',
  })
  lowerMeeting!: ConflictMeetingRefDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: Date | null;
}
