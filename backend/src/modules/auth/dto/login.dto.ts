import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from './transforms';

export class LoginDto {
  @ApiProperty({
    example: 'admin@bbs.gov.bd',
    description: 'Login email (case-insensitive)',
  })
  @NormalizeEmail()
  @IsEmail({}, { message: 'সঠিক ইমেইল ঠিকানা দিন।' })
  @MaxLength(254, { message: 'ইমেইল খুব দীর্ঘ।' })
  loginEmail!: string;

  @ApiProperty({ example: 'Secret1234', format: 'password' })
  @IsString({ message: 'পাসওয়ার্ড দিন।' })
  @IsNotEmpty({ message: 'পাসওয়ার্ড দিন।' })
  // Upper bound so huge inputs cannot be used to burn CPU in argon2.
  @MaxLength(128, { message: 'পাসওয়ার্ড সর্বোচ্চ ১২৮ অক্ষরের হতে পারে।' })
  password!: string;
}
