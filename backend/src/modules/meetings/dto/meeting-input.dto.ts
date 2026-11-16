import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  normalizeEmail,
  trimText,
  trimToNull,
} from '../../../common/dto/transforms';
import { normalizeBangla } from '../../../common/utils/bangla';
import { ConflictStatus } from '../enums/conflict-status.enum';
import { MeetingStatus } from '../enums/meeting-status.enum';

/** ISO 8601 date-time WITH an explicit offset (Z or ±hh:mm), e.g. 2026-12-01T10:30:00+06:00. */
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const TIME_MESSAGE =
  'সময় ISO 8601 আকারে, অফসেটসহ দিন (যেমন 2026-12-01T10:30:00+06:00)।';

/** Trimmed, inner whitespace collapsed, Bangla nukta letters in the stored form (§13.13). */
const trimBangla = (params: TransformFnParams): unknown => {
  const value = trimText(params);
  return typeof value === 'string' ? normalizeBangla(value) : value;
};

export const MAX_GUESTS = 50;

/** A guest officer (অতিথি কর্মকর্তা): invited by name and email, without an account (v1.5). */
export class MeetingGuestInputDto {
  @ApiProperty({ example: 'ড. ফারহানা ইসলাম', maxLength: 200 })
  @Transform(trimBangla)
  @IsString({ message: 'অতিথি কর্মকর্তার নাম দিন।' })
  @Length(1, 200, {
    message: 'অতিথি কর্মকর্তার নাম ১ থেকে ২০০ অক্ষরের হতে হবে।',
  })
  name!: string;

  @ApiProperty({ example: 'যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয়', maxLength: 200 })
  @Transform(trimBangla)
  @IsString({ message: 'অতিথি কর্মকর্তার পদবি দিন।' })
  @Length(1, 200, {
    message: 'অতিথি কর্মকর্তার পদবি ১ থেকে ২০০ অক্ষরের হতে হবে।',
  })
  designation!: string;

  @ApiProperty({ example: 'farhana@plancomm.gov.bd', maxLength: 254 })
  @Transform(normalizeEmail)
  @IsString({ message: 'অতিথি কর্মকর্তার Email দিন।' })
  @MaxLength(254, { message: 'অতিথি কর্মকর্তার Email খুব দীর্ঘ।' })
  @IsEmail({}, { message: 'অতিথি কর্মকর্তার সঠিক Email ঠিকানা দিন।' })
  email!: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'This guest chairs the meeting (then chairId must be empty; at most one chair in total)',
  })
  @IsOptional()
  @IsBoolean({ message: 'isChair true অথবা false হতে হবে।' })
  isChair?: boolean;
}

export class CreateMeetingDto {
  @ApiProperty({
    example: 'বার্ষিক উন্নয়ন কর্মসূচি পর্যালোচনা সভা',
    minLength: 3,
    maxLength: 200,
  })
  @Transform(trimText)
  @IsString({ message: 'সভার শিরোনাম দিন।' })
  @Length(3, 200, { message: 'শিরোনাম ৩ থেকে ২০০ অক্ষরের হতে হবে।' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example:
      '১. গত সভার সিদ্ধান্ত বাস্তবায়ন অগ্রগতি\n২. ২০২৬-২৭ অর্থবছরের এডিপি\n৩. বিবিধ',
    maxLength: 5000,
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'আলোচ্যসূচি লেখা হতে হবে।' })
  @MaxLength(5000, { message: 'আলোচ্যসূচি সর্বোচ্চ ৫০০০ অক্ষরের হতে পারে।' })
  agenda?: string | null;

  @ApiProperty({
    example: '2026-12-01T10:30:00+06:00',
    description: 'ISO 8601 with offset',
  })
  @Matches(ISO_WITH_OFFSET, { message: TIME_MESSAGE })
  @IsISO8601({ strict: true }, { message: TIME_MESSAGE })
  startAt!: string;

  @ApiProperty({
    example: '2026-12-01T12:00:00+06:00',
    description: 'After startAt, at most 12 h later',
  })
  @Matches(ISO_WITH_OFFSET, { message: TIME_MESSAGE })
  @IsISO8601({ strict: true }, { message: TIME_MESSAGE })
  endAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'সম্মেলন কক্ষ, ৫ম তলা, পরিসংখ্যান ভবন',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'কক্ষের নাম লেখা হতে হবে।' })
  @MaxLength(100, { message: 'কক্ষের নাম সর্বোচ্চ ১০০ অক্ষরের হতে পারে।' })
  room?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://meet.google.com/abc-defg-hij',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'Online Link https:// দিয়ে শুরু হওয়া সঠিক ঠিকানা হতে হবে।' },
  )
  @MaxLength(1000, { message: 'Link খুব দীর্ঘ।' })
  onlineLink?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      "Internal chairperson (an officer). The meeting gets the chair's designation priority; with a guest chair (guests[].isChair) or no chair it gets the organizer's.",
  })
  @IsOptional()
  @IsUUID('4', { message: 'সঠিক সভাপতি নির্বাচন করুন।' })
  chairId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 200,
    description:
      'Invited officers (ids from GET /users/directory). The organizer is added automatically.',
  })
  @IsOptional()
  @IsArray({ message: 'অংশগ্রহণকারীদের তালিকা দিন।' })
  @ArrayUnique({ message: 'একই অংশগ্রহণকারী একাধিকবার দেওয়া যাবে না।' })
  @ArrayMaxSize(200, { message: 'সর্বোচ্চ ২০০ জন অংশগ্রহণকারী দেওয়া যাবে।' })
  @IsUUID('4', { each: true, message: 'অংশগ্রহণকারীর আইডি সঠিক নয়।' })
  participantIds?: string[];

  @ApiPropertyOptional({
    type: [MeetingGuestInputDto],
    maxItems: MAX_GUESTS,
    description:
      'Guest officers (no account; mail only). On update the whole list is replaced. Not part of the conflict check.',
  })
  @IsOptional()
  @IsArray({ message: 'অতিথি কর্মকর্তাদের তালিকা দিন।' })
  @ArrayMaxSize(MAX_GUESTS, {
    message: 'সর্বোচ্চ ৫০ জন অতিথি কর্মকর্তা দেওয়া যাবে।',
  })
  @ValidateNested({ each: true })
  @Type(() => MeetingGuestInputDto)
  guests?: MeetingGuestInputDto[];
}

/**
 * Any subset. `participantIds` and `guests` replace the whole list; `null` clears
 * room/link/chair/agenda.
 * The conflict engine re-runs only when the time or the people change.
 */
export class UpdateMeetingDto extends PartialType(CreateMeetingDto) {}

export class CheckConflictsDto extends CreateMeetingDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Set when editing an existing meeting: it is excluded; its stored priority is used unless the chair changes',
  })
  @IsOptional()
  @IsUUID('4', { message: 'সভার আইডি সঠিক নয়।' })
  meetingId?: string;
}

export class CancelMeetingDto {
  @ApiProperty({
    example: 'মাননীয় সচিব মহোদয়ের জরুরি সভার কারণে স্থগিত।',
    minLength: 3,
  })
  @Transform(trimText)
  @IsString({ message: 'বাতিলের কারণ লিখুন।' })
  @Length(3, 1000, { message: 'বাতিলের কারণ ৩ থেকে ১০০০ অক্ষরের হতে হবে।' })
  reason!: string;
}

export class CompleteMeetingDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example:
      'সিদ্ধান্ত: ১. এডিপি সংশোধনী প্রস্তাব ১৫ ডিসেম্বরের মধ্যে পাঠানো হবে।',
    description: 'Notes / minutes',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'নোট লেখা হতে হবে।' })
  @MaxLength(20000, { message: 'নোট সর্বোচ্চ ২০০০০ অক্ষরের হতে পারে।' })
  notes?: string | null;
}

export class MeetingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-01T00:00:00+06:00',
    description: 'Meetings ending after this',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: TIME_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59+06:00',
    description: 'Meetings starting before this',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: TIME_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ enum: MeetingStatus })
  @IsOptional()
  @IsEnum(MeetingStatus, { message: 'অবৈধ status।' })
  status?: MeetingStatus;

  @ApiPropertyOptional({
    enum: ['organizer', 'participant'],
    description:
      'organizer = I organize; participant = I am invited (not organizer)',
  })
  @IsOptional()
  @IsIn(['organizer', 'participant'], {
    message: 'role organizer অথবা participant হতে হবে।',
  })
  role?: 'organizer' | 'participant';

  @ApiPropertyOptional({
    enum: ['mine', 'all'],
    default: 'mine',
    description: 'all = every meeting (ADMIN only)',
  })
  @IsOptional()
  @IsIn(['mine', 'all'], { message: 'scope mine অথবা all হতে হবে।' })
  scope?: 'mine' | 'all';
}

/** GET /conflicts/mine: PENDING (default) or RESOLVED. */
export class MyConflictsQueryDto {
  @ApiPropertyOptional({
    enum: ConflictStatus,
    default: ConflictStatus.PENDING,
    description: 'RESOLVED = history (newest first, at most 100)',
  })
  @IsOptional()
  @IsEnum(ConflictStatus, { message: 'অবৈধ status।' })
  status?: ConflictStatus;
}

export class ConflictQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ConflictStatus })
  @IsOptional()
  @IsEnum(ConflictStatus, { message: 'অবৈধ status।' })
  status?: ConflictStatus;
}
