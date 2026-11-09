import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
} from 'class-validator';
import {
  normalizeEmail,
  normalizeMobile,
  normalizePhone,
  trimText,
  trimToNull,
} from '../../../common/dto/transforms';
import { BD_MOBILE_PATTERN } from '../../../common/utils/phone';

/** Digits with optional leading +, spaces and dashes (Bangla digits are converted first). */
export const PHONE_PATTERN = /^\+?[0-9][0-9 -]{3,}[0-9]$/;
const PHONE_MESSAGE = 'সঠিক ফোন নম্বর দিন (শুধু সংখ্যা, +, স্পেস বা -)।';
const MOBILE_MESSAGE = 'সঠিক মোবাইল নম্বর দিন (যেমন 01712345678)।';

/** Trims each charge, drops empty ones and duplicates (order kept). Non-arrays untouched. */
const trimCharges = ({ value }: { value: unknown }): unknown => {
  if (!Array.isArray(value)) return value;
  const items = (value as unknown[])
    .map((v): unknown =>
      typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v,
    )
    .filter((v) => v !== '');
  return [...new Set(items)];
};

export class CreateUserDto {
  @ApiProperty({
    example: 'rahim.uddin@bbs.gov.bd',
    description: 'Unique, stored lowercase',
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'সঠিক লগইন ইমেইল দিন।' })
  @MaxLength(254, { message: 'ইমেইল খুব দীর্ঘ।' })
  loginEmail!: string;

  @ApiPropertyOptional({
    example: 'rahim.personal@gmail.com',
    description: 'Where mail is sent. Defaults to loginEmail.',
  })
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'সঠিক নোটিফিকেশন ইমেইল দিন।' })
  @MaxLength(254, { message: 'ইমেইল খুব দীর্ঘ।' })
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
  @MaxLength(50, { message: 'ফোন নম্বর খুব দীর্ঘ।' })
  officePhone?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+880 2 55007375',
  })
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  @MaxLength(50, { message: 'ফ্যাক্স নম্বর খুব দীর্ঘ।' })
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
    type: [String],
    example: ['ফোকাল পয়েন্ট কর্মকর্তা, এসডিজি সেল'],
    description:
      'Replaces the whole list. Empty entries and duplicates are removed.',
  })
  @IsOptional()
  @Transform(trimCharges)
  @IsArray({ message: 'অতিরিক্ত দায়িত্ব একটি তালিকা হতে হবে।' })
  @ArrayMaxSize(20, { message: 'সর্বোচ্চ ২০টি অতিরিক্ত দায়িত্ব দেওয়া যাবে।' })
  @IsString({ each: true, message: 'প্রতিটি অতিরিক্ত দায়িত্ব লেখা হতে হবে।' })
  @MaxLength(300, {
    each: true,
    message: 'প্রতিটি অতিরিক্ত দায়িত্ব সর্বোচ্চ ৩০০ অক্ষরের হতে পারে।',
  })
  additionalCharges?: string[];
}
