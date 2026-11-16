import { ApiProperty } from '@nestjs/swagger';
import { WingRefDto } from '../../users/dto/user-response.dto';
import { ConflictStatus } from '../enums/conflict-status.enum';
import { MeetingStatus } from '../enums/meeting-status.enum';
import { ParticipantRole } from '../enums/participant-role.enum';

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

  @ApiProperty({ type: PersonDto })
  organizer!: PersonDto;

  @ApiProperty({
    enum: ParticipantRole,
    nullable: true,
    description: 'My role in this meeting (null = admin view)',
  })
  myRole!: ParticipantRole | null;
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
    example: false,
    description:
      'True when the current user organizes this meeting (may cancel/reschedule it)',
  })
  organizedByMe!: boolean;
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
}

/** 409 body of POST/PATCH /meetings when a clash is blocking. */
export class MeetingConflictErrorDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({
    example:
      'নির্বাচিত সময়ে এক বা একাধিক কর্মকর্তার সমান বা উচ্চতর অগ্রাধিকারের সভা আছে। সময় বা অংশগ্রহণকারী পরিবর্তন করুন।',
  })
  message!: string;

  @ApiProperty({ example: 'Conflict' })
  error!: string;

  @ApiProperty({ type: [ClashDto] })
  blocking!: ClashDto[];

  @ApiProperty({
    example: 'TIME_CONFLICT_BLOCKING',
    description: 'Stable message code (v1.6)',
  })
  code!: string;
}

export class CheckConflictsResponseDto {
  @ApiProperty({ example: false, description: 'false = saving would give 409' })
  allowed!: boolean;

  @ApiProperty({ type: [ClashDto] })
  blocking!: ClashDto[];

  @ApiProperty({
    type: [ClashDto],
    description:
      'Lower meetings whose people would be asked to cancel/reschedule',
  })
  willNotify!: ClashDto[];
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
