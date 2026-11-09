import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EmailStatus } from '../enums/email-status.enum';

export class EmailOutboxQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EmailStatus, example: EmailStatus.FAILED })
  @IsOptional()
  @IsEnum(EmailStatus, { message: 'status PENDING, SENT অথবা FAILED হতে হবে।' })
  status?: EmailStatus;
}

/** Mail queue row for admins. Deliberately without the body (html/text). */
export class EmailOutboxItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'rahim@bbs.gov.bd' })
  to!: string;

  @ApiProperty({ example: 'পাসওয়ার্ড রিসেট' })
  subject!: string;

  @ApiProperty({ enum: EmailStatus })
  status!: EmailStatus;

  @ApiProperty({ example: 2 })
  attempts!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'ECONNECTION Connection timeout',
  })
  lastError!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  nextAttemptAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sentAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
