import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'q3Zr0Vx9mXbH1a2c3d4e5f6g7h8i9j0kLmNoPqRsTuV',
    description: 'Token from the reset link (?token=...)',
  })
  @IsString({ message: 'রিসেট টোকেন দিন।' })
  @Length(20, 200, { message: 'রিসেট লিংকটি অবৈধ।' })
  token!: string;

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
