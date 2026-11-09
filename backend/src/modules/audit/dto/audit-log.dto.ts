import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AuditAction } from '../enums/audit-action.enum';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Who did it' })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ actorId।' })
  actorId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction, { message: 'অবৈধ action।' })
  action?: AuditAction;

  @ApiPropertyOptional({
    example: 'meeting',
    description: 'user, meeting, designation, change_request, …',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Id of the changed record' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00+06:00' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from সঠিক ISO 8601 সময় হতে হবে।' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59+06:00' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to সঠিক ISO 8601 সময় হতে হবে।' })
  to?: string;
}

export class AuditActorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'মোঃ রহিম উদ্দিন' }) nameBn!: string;
  @ApiProperty({ example: 'Md. Rahim Uddin' }) nameEn!: string;
}

export class AuditLogItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AuditAction, example: AuditAction.MEETING_CREATE })
  action!: string;
  @ApiProperty({ example: 'meeting' }) entityType!: string;
  @ApiProperty({ type: String, nullable: true }) entityId!: string | null;
  @ApiProperty({
    type: AuditActorDto,
    nullable: true,
    description: 'null = system / unknown user',
  })
  actor!: AuditActorDto | null;
  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Secrets removed, phone numbers masked',
  })
  before!: unknown;
  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Secrets removed, phone numbers masked',
  })
  after!: unknown;
  @ApiProperty({ type: String, nullable: true, example: '10.0.0.5' }) ip!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
