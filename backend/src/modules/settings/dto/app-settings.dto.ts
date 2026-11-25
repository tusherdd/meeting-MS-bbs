import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SETTINGS_MESSAGES } from '../settings.messages';
import {
  NOTICE_EXTRACTION_METHODS,
  type NoticeExtractionMethod,
} from '../settings.types';

/** GET / PATCH /admin/settings response. */
export class AppSettingsDto {
  @ApiProperty({
    enum: NOTICE_EXTRACTION_METHODS,
    example: 'OCR',
    description:
      'How "fill the meeting form from the notice" reads the notice: OCR (local, default) or AI (Anthropic).',
  })
  noticeExtractionMethod!: NoticeExtractionMethod;

  @ApiProperty({
    example: false,
    description:
      'true when ANTHROPIC_API_KEY is set on the server (the AI option can be chosen). The key itself is never returned.',
  })
  aiAvailable!: boolean;
}

/** PATCH /admin/settings body. */
export class UpdateAppSettingsDto {
  @ApiProperty({ enum: NOTICE_EXTRACTION_METHODS, example: 'AI' })
  @IsIn(NOTICE_EXTRACTION_METHODS, { message: SETTINGS_MESSAGES.methodInvalid })
  noticeExtractionMethod!: NoticeExtractionMethod;
}
