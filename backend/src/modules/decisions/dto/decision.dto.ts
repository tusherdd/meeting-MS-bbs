import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean } from '../../../common/dto/transforms';
import { MeetingSummaryDto } from '../../meetings/dto/meeting-response.dto';
import { DecisionStatus } from '../decision-rules';

/** v1.11 (SPEC.md §6.9): `files` = up to 10 PDF / JPEG / PNG files, at most 10 MB each. */
export class DecisionUploadDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'PDF, JPEG or PNG (checked by their bytes), max 10 MB each, max 10 per meeting. Image metadata (EXIF) is removed.',
  })
  files!: unknown[];
}

export class DecisionUploaderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' })
  nameBn!: string;
  @ApiProperty({ example: 'Md. Rahim Uddin' })
  nameEn!: string;
}

export class DecisionFileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'সভার সিদ্ধান্ত.pdf',
    description:
      'Sanitized original name; the extension follows the detected type',
  })
  originalName!: string;

  @ApiProperty({ enum: ['application/pdf', 'image/jpeg', 'image/png'] })
  mime!: string;

  @ApiProperty({ example: 182044, description: 'Bytes' })
  size!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: DecisionUploaderDto })
  uploadedBy!: DecisionUploaderDto;

  @ApiProperty({
    description:
      'The current user may delete it (uploader, organizer or chair)',
  })
  canDelete!: boolean;
}

export class DecisionDetailDto {
  @ApiProperty({ type: MeetingSummaryDto })
  meeting!: MeetingSummaryDto;

  @ApiProperty({
    enum: DecisionStatus,
    enumName: 'DecisionStatus',
    nullable: true,
    description: 'null = cancelled or not started yet',
  })
  status!: DecisionStatus | null;

  @ApiProperty({ description: 'The current user may upload now' })
  canUpload!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['forbidden', 'cancelled', 'notStarted', 'tooMany'],
    description: 'Why an upload is not possible (null = it is)',
  })
  uploadBlock!: 'forbidden' | 'cancelled' | 'notStarted' | 'tooMany' | null;

  @ApiProperty({ example: 10 })
  maxFiles!: number;

  @ApiProperty({ example: 10 })
  maxFileMb!: number;

  @ApiProperty({ type: [DecisionFileDto], description: 'Oldest first' })
  files!: DecisionFileDto[];
}

export class DecisionSummaryDto {
  @ApiProperty({
    example: 2,
    description: 'Meetings I organize or chair whose decision is Pending',
  })
  pending!: number;

  @ApiProperty({
    example: 5,
    description: 'Meetings I organize or chair whose decision is Complete',
  })
  complete!: number;

  @ApiProperty({
    description:
      'I organize or chair at least one meeting (shows the dashboard card)',
  })
  leads!: boolean;
}

export class DecisionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: DecisionStatus,
    default: DecisionStatus.PENDING,
    description: 'For `as=member` only PENDING is listed',
  })
  @IsOptional()
  @IsIn([DecisionStatus.PENDING, DecisionStatus.COMPLETE], {
    message: 'status PENDING অথবা COMPLETE হতে হবে।',
  })
  status: DecisionStatus = DecisionStatus.PENDING;

  @ApiPropertyOptional({
    enum: ['lead', 'member'],
    default: 'lead',
    description:
      'lead = meetings I organize or chair; member = meetings where I am only a member (Pending only)',
  })
  @IsOptional()
  @IsIn(['lead', 'member'], { message: 'as lead অথবা member হতে হবে।' })
  as: 'lead' | 'member' = 'lead';
}

export class DecisionDownloadQueryDto {
  @ApiPropertyOptional({
    description: 'true = open in the browser (Content-Disposition: inline)',
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'inline true অথবা false হতে হবে।' })
  inline?: boolean;
}
