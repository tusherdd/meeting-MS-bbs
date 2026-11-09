import { ApiProperty, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../common/dto/transforms';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { UserDetailDto } from '../../users/dto/user-response.dto';

/**
 * The ONLY fields an officer may change on their own profile (SPEC.md §6.2). Anything else —
 * loginEmail, designationId, role, isActive, ... — is rejected by the global ValidationPipe
 * (forbidNonWhitelisted). Login email and designation change through change requests.
 */
export class UpdateProfileDto extends PartialType(
  PickType(CreateUserDto, [
    'nameBn',
    'nameEn',
    'mobile',
    'mobileAlt',
    'officePhone',
    'fax',
    'wingId',
    'designationRemark',
    'additionalCharges',
  ] as const),
) {}

/** My own profile: the admin detail view without admin-only fields. */
export class ProfileResponseDto extends OmitType(UserDetailDto, [
  'failedLoginCount',
  'isActive',
] as const) {}

export class ChangeNotificationEmailDto {
  @ApiProperty({
    example: 'rahim.personal@gmail.com',
    description:
      'New address; becomes active only after the link sent to it is clicked',
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'সঠিক ইমেইল ঠিকানা দিন।' })
  @MaxLength(254, { message: 'ইমেইল খুব দীর্ঘ।' })
  email!: string;
}

export class VerifyNotificationEmailQueryDto {
  @ApiProperty({ description: 'Token from the verification link (?token=...)' })
  @IsString({ message: 'যাচাই টোকেন দিন।' })
  @Length(20, 200, { message: 'যাচাই লিংকটি অবৈধ।' })
  token!: string;
}

/** Swagger body for multipart photo upload. */
export class PhotoUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'JPEG, PNG or WebP. Re-encoded to a 512×512 WebP; EXIF/GPS removed.',
  })
  file!: unknown;
}
