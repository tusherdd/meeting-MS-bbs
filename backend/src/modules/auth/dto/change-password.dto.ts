import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldSecret123', format: 'password' })
  @IsString({ message: 'বর্তমান Password দিন।' })
  @IsNotEmpty({ message: 'বর্তমান Password দিন।' })
  @MaxLength(128, { message: 'Password সর্বোচ্চ ১২৮ অক্ষরের হতে পারে।' })
  currentPassword!: string;

  @ApiProperty({
    example: 'NewSecret456',
    format: 'password',
    description:
      'At least 8 characters with letters and digits; not equal to the login email',
  })
  @IsString({ message: 'নতুন Password দিন।' })
  @MaxLength(128, { message: 'Password সর্বোচ্চ ১২৮ অক্ষরের হতে পারে।' })
  newPassword!: string;
}
