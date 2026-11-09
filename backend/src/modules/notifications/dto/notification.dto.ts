import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean } from '../../../common/dto/transforms';

export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'true = only unread notifications',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'unread true অথবা false হতে হবে।' })
  unread?: boolean;
}

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CHANGE_REQUEST_APPROVED' })
  type!: string;

  @ApiProperty({ example: 'আপনার পদবি পরিবর্তনের অনুরোধ অনুমোদিত হয়েছে' })
  title!: string;

  @ApiProperty({ example: 'পরিবর্তনটি কার্যকর করা হয়েছে।' })
  body!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/profile/change-requests',
  })
  link!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'null = unread',
  })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class UnreadCountDto {
  @ApiProperty({ example: 3 })
  count!: number;
}

export class MarkAllReadResponseDto {
  @ApiProperty({
    example: 5,
    description: 'How many notifications were marked read',
  })
  updated!: number;
}
