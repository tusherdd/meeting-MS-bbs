import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { toBoolean } from '../../../common/dto/transforms';

export class NoticeUploaderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'মোঃ রহিম' }) nameBn!: string;
  @ApiProperty({ example: 'Md. Rahim' }) nameEn!: string;
}

/** The meeting's uploaded notice "সভার নোটিশ" (v1.13, SPEC.md §6.8). */
export class NoticeFileDto {
  @ApiProperty({
    example: 'সভার নোটিশ.pdf',
    description: 'Sanitized original name',
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

  @ApiProperty({ type: NoticeUploaderDto })
  uploadedBy!: NoticeUploaderDto;

  @ApiProperty({
    example: true,
    description:
      'I may replace or remove it (the organizer; not for cancelled meetings)',
  })
  canManage!: boolean;
}

export class NoticeUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'One PDF, DOCX (no macros), JPEG or PNG file, max 10 MB',
  })
  file!: unknown;
}

export class NoticeDownloadQueryDto {
  @ApiPropertyOptional({
    description:
      'true = open a PDF or image in the browser (Content-Disposition: inline); a DOCX is always an attachment',
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'inline true অথবা false হতে হবে।' })
  inline?: boolean;
}
