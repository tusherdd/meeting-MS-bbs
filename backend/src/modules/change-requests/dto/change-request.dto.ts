import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { normalizeEmail, trimText } from '../../../common/dto/transforms';
import { DesignationRefDto } from '../../users/dto/user-response.dto';
import { ChangeRequestStatus } from '../enums/change-request-status.enum';
import { ChangeRequestType } from '../enums/change-request-type.enum';
import { CHANGE_REQUEST_MESSAGES } from '../change-requests.messages';

export class CreateChangeRequestDto {
  @ApiProperty({
    enum: ChangeRequestType,
    example: ChangeRequestType.DESIGNATION,
  })
  @IsEnum(ChangeRequestType, {
    message: 'type LOGIN_EMAIL অথবা DESIGNATION হতে হবে।',
  })
  type!: ChangeRequestType;

  @ApiPropertyOptional({
    example: 'rahim.new@bbs.gov.bd',
    description:
      'Required when type = LOGIN_EMAIL. Must not be used by any account.',
  })
  @ValidateIf(
    (o: CreateChangeRequestDto) => o.type === ChangeRequestType.LOGIN_EMAIL,
  )
  @Transform(normalizeEmail)
  @IsEmail({}, { message: CHANGE_REQUEST_MESSAGES.loginEmailRequired })
  @MaxLength(254, { message: 'ইমেইল খুব দীর্ঘ।' })
  loginEmail?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required when type = DESIGNATION. Must be active and different from yours.',
  })
  @ValidateIf(
    (o: CreateChangeRequestDto) => o.type === ChangeRequestType.DESIGNATION,
  )
  @IsUUID('4', { message: CHANGE_REQUEST_MESSAGES.designationRequired })
  designationId?: string;
}

export class ApproveChangeRequestDto {
  @ApiPropertyOptional({ example: 'যাচাই করে অনুমোদন করা হলো।' })
  @IsOptional()
  @Transform(trimText)
  @IsString({ message: 'মন্তব্য লেখা হতে হবে।' })
  @MaxLength(1000, { message: 'মন্তব্য সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।' })
  note?: string;
}

export class RejectChangeRequestDto {
  @ApiProperty({
    example: 'পদোন্নতির আদেশের কপি সংযুক্ত করে আবার আবেদন করুন।',
    description: 'Required: the officer sees why',
  })
  @Transform(trimText)
  @IsString({ message: 'প্রত্যাখ্যানের কারণ লিখুন।' })
  @MinLength(3, { message: 'প্রত্যাখ্যানের কারণ কমপক্ষে ৩ অক্ষরের হতে হবে।' })
  @MaxLength(1000, { message: 'মন্তব্য সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।' })
  note!: string;
}

export class ChangeRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ChangeRequestStatus,
    example: ChangeRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ChangeRequestStatus, { message: 'অবৈধ status।' })
  status?: ChangeRequestStatus;

  @ApiPropertyOptional({ enum: ChangeRequestType })
  @IsOptional()
  @IsEnum(ChangeRequestType, { message: 'অবৈধ type।' })
  type?: ChangeRequestType;
}

export class ChangeValueDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'rahim@bbs.gov.bd',
  })
  loginEmail?: string | null;

  @ApiPropertyOptional({ type: DesignationRefDto, nullable: true })
  designation?: DesignationRefDto | null;
}

export class PersonRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' })
  nameBn!: string;

  @ApiProperty({ example: 'Md. Rahim Uddin' })
  nameEn!: string;
}

export class RequesterDto extends PersonRefDto {
  @ApiProperty({ example: 'rahim@bbs.gov.bd' })
  loginEmail!: string;
}

export class ChangeRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ChangeRequestType })
  type!: ChangeRequestType;

  @ApiProperty({ enum: ChangeRequestStatus })
  status!: ChangeRequestStatus;

  @ApiProperty({ type: RequesterDto })
  requester!: RequesterDto;

  @ApiProperty({
    type: ChangeValueDto,
    description:
      "The requester's value right now (after approval = the new value)",
  })
  currentValue!: ChangeValueDto;

  @ApiProperty({ type: ChangeValueDto })
  requestedValue!: ChangeValueDto;

  @ApiProperty({ type: PersonRefDto, nullable: true })
  reviewedBy!: PersonRefDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  reviewNote!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
