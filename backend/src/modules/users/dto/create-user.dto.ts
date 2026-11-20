import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  normalizeEmail,
  normalizeMobile,
  normalizePhone,
  trimText,
  trimToNull,
} from '../../../common/dto/transforms';
import { BD_MOBILE_PATTERN } from '../../../common/utils/phone';
import { IsEnglishName } from '../../../common/validators/english-name';

/** Digits with optional leading +, spaces and dashes (Bangla digits are converted first). */
export const PHONE_PATTERN = /^\+?[0-9][0-9 -]{3,}[0-9]$/;
const PHONE_MESSAGE = 'সঠিক Phone নম্বর দিন (শুধু সংখ্যা, +, স্পেস বা -)।';
const MOBILE_MESSAGE = 'সঠিক Mobile নম্বর দিন (যেমন 01712345678)।';

/**
 * v1.16 (SPEC.md §6.2): one structured additional charge — a designation (required), an optional
 * wing and an optional note ("বিকল্প", "চলতি দায়িত্ব"). Admin only.
 */
export class AdditionalChargeInputDto {
  @ApiProperty({ format: 'uuid', description: 'Designation of the charge' })
  @IsUUID('4', { message: 'অতিরিক্ত দায়িত্বের পদবি বেছে নিন।' })
  designationId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Optional wing of the charge',
  })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ উইং আইডি।' })
  wingId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'চলতি দায়িত্ব',
    description: 'Optional note (max 300)',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'নোট লেখা হতে হবে।' })
  @MaxLength(300, { message: 'নোট সর্বোচ্চ ৩০০ অক্ষরের হতে পারে।' })
  note?: string | null;
}

export class CreateUserDto {
  @ApiProperty({
    example: 'rahim.uddin@bbs.gov.bd',
    description: 'Unique, stored lowercase',
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'সঠিক Login Email দিন।' })
  @MaxLength(254, { message: 'Email খুব দীর্ঘ।' })
  loginEmail!: string;

  @ApiPropertyOptional({
    example: 'rahim.personal@gmail.com',
    description: 'Where mail is sent. Defaults to loginEmail.',
  })
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'সঠিক Notification Email দিন।' })
  @MaxLength(254, { message: 'Email খুব দীর্ঘ।' })
  notificationEmail?: string;

  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' })
  @Transform(trimText)
  @IsString({ message: 'বাংলা নাম দিন।' })
  @IsNotEmpty({ message: 'বাংলা নাম দিন।' })
  @MaxLength(200, { message: 'বাংলা নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।' })
  nameBn!: string;

  @ApiProperty({ example: 'Md. Rahim Uddin' })
  @Transform(trimText)
  @IsString({ message: 'ইংরেজি নাম দিন।' })
  @IsNotEmpty({ message: 'ইংরেজি নাম দিন।' })
  @MaxLength(200, { message: 'ইংরেজি নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।' })
  @IsEnglishName()
  nameEn!: string;

  @ApiProperty({ format: 'uuid', description: 'Must be an active designation' })
  @IsUUID('4', { message: 'সঠিক পদবি নির্বাচন করুন।' })
  designationId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'চলতি দায়িত্ব',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'পদবির মন্তব্য লেখা হতে হবে।' })
  @MaxLength(100, { message: 'পদবির মন্তব্য সর্বোচ্চ ১০০ অক্ষরের হতে পারে।' })
  designationRemark?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'সঠিক উইং নির্বাচন করুন।' })
  wingId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '01712345678',
    description:
      'Bangladesh mobile. Bangla/English digits, +880 accepted; stored as 01XXXXXXXXX',
  })
  @IsOptional()
  @Transform(normalizeMobile)
  @Matches(BD_MOBILE_PATTERN, { message: MOBILE_MESSAGE })
  mobile?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '01812345678',
    description:
      'Bangladesh mobile. Bangla/English digits, +880 accepted; stored as 01XXXXXXXXX',
  })
  @IsOptional()
  @Transform(normalizeMobile)
  @Matches(BD_MOBILE_PATTERN, { message: MOBILE_MESSAGE })
  mobileAlt?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+880 2 55007373',
  })
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  @MaxLength(50, { message: 'Phone নম্বর খুব দীর্ঘ।' })
  officePhone?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+880 2 55007375',
  })
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  @MaxLength(50, { message: 'Fax নম্বর খুব দীর্ঘ।' })
  fax?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'বাংলাদেশ পরিসংখ্যান ব্যুরো',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'প্রতিষ্ঠানের নাম লেখা হতে হবে।' })
  @MaxLength(300, { message: 'প্রতিষ্ঠানের নাম খুব দীর্ঘ।' })
  organizationBn?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Bangladesh Bureau of Statistics',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'প্রতিষ্ঠানের নাম লেখা হতে হবে।' })
  @MaxLength(300, { message: 'প্রতিষ্ঠানের নাম খুব দীর্ঘ।' })
  organizationEn?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '২৭তম' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: 'বিসিএস ব্যাচ লেখা হতে হবে।' })
  @MaxLength(50, { message: 'বিসিএস ব্যাচ খুব দীর্ঘ।' })
  bcsBatch?: string | null;

  @ApiPropertyOptional({
    type: [AdditionalChargeInputDto],
    description:
      'v1.16: replaces the whole list (admin only). Each charge: designation (required), wing and note (optional); no charge twice (same designation and wing).',
  })
  @IsOptional()
  @IsArray({ message: 'অতিরিক্ত দায়িত্ব একটি তালিকা হতে হবে।' })
  @ArrayMaxSize(20, { message: 'সর্বোচ্চ ২০টি অতিরিক্ত দায়িত্ব দেওয়া যাবে।' })
  @ValidateNested({ each: true })
  @Type(() => AdditionalChargeInputDto)
  additionalCharges?: AdditionalChargeInputDto[];
}
