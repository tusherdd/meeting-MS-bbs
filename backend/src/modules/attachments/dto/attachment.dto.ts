import { ApiProperty } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeBangla } from '../../../common/utils/bangla';
import { MAX_ATTACHMENT_NAME, MAX_ATTACHMENTS } from '../attachment-rules';
import { ATTACHMENT_MESSAGES as MSG } from '../attachments.messages';

/** Trim, collapse inner whitespace, store the Bangla nukta letters in one form (§13.13). */
const cleanLabel = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string'
    ? normalizeBangla(value.trim().replace(/\s+/g, ' '))
    : value;

/** One "অন্যান্য সংযুক্তি" file (v1.17, SPEC.md §6.11). */
export class AttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'বাজেট প্রস্তাব',
    description: 'The label typed by the organizer ("ফাইলের নাম")',
  })
  name!: string;

  @ApiProperty({
    example: 'budget-2026.pdf',
    description:
      'Sanitized original file name; the extension follows the detected type',
  })
  originalName!: string;

  @ApiProperty({
    example: 'application/pdf',
    description:
      'Detected from the bytes: application/pdf, the DOCX type, image/jpeg or image/png',
  })
  mime!: string;

  @ApiProperty({ example: 182044, description: 'Size in bytes' })
  size!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  uploadedAt!: Date;
}

export class AttachmentListDto {
  @ApiProperty({
    type: AttachmentDto,
    isArray: true,
    description: 'Oldest first',
  })
  items!: AttachmentDto[];

  @ApiProperty({
    example: true,
    description:
      'I may add and remove attachments (the organizer; not for cancelled meetings)',
  })
  canManage!: boolean;

  @ApiProperty({
    example: MAX_ATTACHMENTS,
    description: 'At most this many per meeting',
  })
  max!: number;
}

/** Multipart body of POST /meetings/:id/attachments (the file itself is the `file` part). */
export class AttachmentUploadDto {
  @ApiProperty({
    example: 'বাজেট প্রস্তাব',
    maxLength: MAX_ATTACHMENT_NAME,
    description:
      'The label shown for the file ("ফাইলের নাম"), required, max 150 characters',
  })
  @Transform(cleanLabel)
  @IsString({ message: MSG.nameRequired })
  @IsNotEmpty({ message: MSG.nameRequired })
  @MaxLength(MAX_ATTACHMENT_NAME, { message: MSG.nameTooLong })
  name!: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'One PDF, DOCX (no macros), JPEG or PNG file, max 10 MB',
  })
  file?: unknown;
}
