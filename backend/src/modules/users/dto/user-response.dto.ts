import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';

export class DesignationRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'উপপরিচালক' })
  nameBn!: string;

  @ApiProperty({ example: 'Deputy Director' })
  nameEn!: string;

  @ApiProperty({ example: 6 })
  priority!: number;
}

export class WingRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'কম্পিউটার উইং' })
  nameBn!: string;

  @ApiProperty({ example: 'Computer Wing' })
  nameEn!: string;
}

export class AdditionalChargeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ফোকাল পয়েন্ট কর্মকর্তা, এসডিজি সেল' })
  description!: string;
}

/** One row of the admin user list. Never contains password or token hashes. */
export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'rahim.uddin@bbs.gov.bd' })
  loginEmail!: string;

  @ApiProperty({ example: 'rahim.uddin@bbs.gov.bd' })
  notificationEmail!: string;

  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' })
  nameBn!: string;

  @ApiProperty({ example: 'Md. Rahim Uddin' })
  nameEn!: string;

  @ApiProperty({ type: String, nullable: true, example: '01712345678' })
  mobile!: string | null;

  @ApiProperty({ type: DesignationRefDto, nullable: true })
  designation!: DesignationRefDto | null;

  @ApiProperty({ type: String, nullable: true, example: 'চলতি দায়িত্ব' })
  designationRemark!: string | null;

  @ApiProperty({ type: WingRefDto, nullable: true })
  wing!: WingRefDto | null;

  @ApiProperty({ enum: UserRole, example: UserRole.OFFICER })
  role!: UserRole;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: false })
  mustChangePassword!: boolean;

  @ApiProperty({
    example: true,
    description: 'Still uses the default officer password (admin view only)',
  })
  passwordIsDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

/** Full user for GET/POST/PATCH /users/:id (admin). */
export class UserDetailDto extends UserSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  pendingNotificationEmail!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '01812345678' })
  mobileAlt!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+880 2 55007373' })
  officePhone!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+880 2 55007375' })
  fax!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Served from step 6 on',
  })
  photoPath!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'বাংলাদেশ পরিসংখ্যান ব্যুরো',
  })
  organizationBn!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Bangladesh Bureau of Statistics',
  })
  organizationEn!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '২৭তম' })
  bcsBatch!: string | null;

  @ApiProperty({ example: 0, description: 'Consecutive failed logins' })
  failedLoginCount!: number;

  @ApiProperty({ type: [AdditionalChargeDto] })
  additionalCharges!: AdditionalChargeDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class DirectoryDesignationDto {
  @ApiProperty({ example: 'উপপরিচালক' })
  nameBn!: string;

  @ApiProperty({ example: 'Deputy Director' })
  nameEn!: string;

  @ApiProperty({ example: 6 })
  priority!: number;
}

/**
 * Participant picker entry (any logged-in user). Deliberately minimal: no email, phone, role
 * or status — officers must not be able to harvest contact data.
 */
export class DirectoryEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' })
  nameBn!: string;

  @ApiProperty({ example: 'Md. Rahim Uddin' })
  nameEn!: string;

  @ApiProperty({ type: DirectoryDesignationDto, nullable: true })
  designation!: DirectoryDesignationDto | null;

  @ApiProperty({ type: WingRefDto, nullable: true })
  wing!: WingRefDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Served from step 6 on',
  })
  photoPath!: string | null;
}

export class UserMessageResponseDto {
  @ApiProperty({
    example:
      'অস্থায়ী পাসওয়ার্ড তৈরি করে ব্যবহারকারীর নোটিফিকেশন ইমেইলে পাঠানো হয়েছে। প্রথম লগইনে পাসওয়ার্ড পরিবর্তন করতে হবে।',
  })
  message!: string;
}
