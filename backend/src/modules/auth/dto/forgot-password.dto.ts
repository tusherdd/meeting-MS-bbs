import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { NormalizeEmail } from './transforms';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'officer@bbs.gov.bd',
    description: 'Login email of the account',
  })
  @NormalizeEmail()
  @IsEmail({}, { message: 'সঠিক ইমেইল ঠিকানা দিন।' })
  @MaxLength(254, { message: 'ইমেইল খুব দীর্ঘ।' })
  loginEmail!: string;
}
