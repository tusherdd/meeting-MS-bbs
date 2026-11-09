import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/enums/user-role.enum';

export class MessageResponseDto {
  @ApiProperty({ example: 'আপনি লগআউট করেছেন।' })
  message!: string;
}

export class AccessTokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Paste into Swagger "Authorize" (also set as httpOnly cookie)',
  })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({
    example: 900,
    description: 'Access token lifetime in seconds',
  })
  expiresIn!: number;
}

export class MeDesignationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'উপপরিচালক' })
  nameBn!: string;

  @ApiProperty({ example: 'Deputy Director' })
  nameEn!: string;

  @ApiProperty({ example: 6, description: 'Lower = higher priority' })
  priority!: number;
}

export class MeWingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'কম্পিউটার উইং' })
  nameBn!: string;

  @ApiProperty({ example: 'Computer Wing' })
  nameEn!: string;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'officer@bbs.gov.bd' })
  loginEmail!: string;

  @ApiProperty({ example: 'officer@bbs.gov.bd' })
  notificationEmail!: string;

  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' })
  nameBn!: string;

  @ApiProperty({ example: 'Md. Rahim Uddin' })
  nameEn!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.OFFICER })
  role!: UserRole;

  @ApiProperty({ example: false })
  mustChangePassword!: boolean;

  @ApiProperty({ type: MeDesignationDto, nullable: true })
  designation!: MeDesignationDto | null;

  @ApiProperty({ type: MeWingDto, nullable: true })
  wing!: MeWingDto | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 6,
    description:
      'Meeting priority from the designation (null for the super admin)',
  })
  priority!: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;
}

export class LoginResponseDto extends AccessTokenResponseDto {
  @ApiProperty({
    example: true,
    description: 'If true, call /auth/change-password first',
  })
  mustChangePassword!: boolean;

  @ApiProperty({ type: MeResponseDto })
  user!: MeResponseDto;
}

export class ChangePasswordResponseDto extends AccessTokenResponseDto {
  @ApiProperty({ example: 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।' })
  message!: string;
}
