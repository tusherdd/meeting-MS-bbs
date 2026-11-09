import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecret123', format: 'password' })
  @IsString({ message: 'বর্তমান পাসওয়ার্ড দিন।' })
  @IsNotEmpty({ message: 'বর্তমান পাসওয়ার্ড দিন।' })
  @MaxLength(128, { message: 'পাসওয়ার্ড সর্বোচ্চ ১২৮ অক্ষরের হতে পারে।' })
  currentPassword!: string;

  @ApiProperty({
    example: 'NewSecret456',
    format: 'password',
    description:
      'At least 8 characters with letters and digits; not equal to the login email',
  })
  @IsString({ message: 'নতুন পাসওয়ার্ড দিন।' })
  @MaxLength(128, { message: 'পাসওয়ার্ড সর্বোচ্চ ১২৮ অক্ষরের হতে পারে।' })
  newPassword!: string;
}
