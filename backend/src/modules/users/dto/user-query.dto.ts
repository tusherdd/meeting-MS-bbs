import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean, trimToNull } from '../../../common/dto/transforms';
import { UserRole } from '../enums/user-role.enum';

export enum UserSortField {
  PRIORITY = 'priority',
  NAME_EN = 'nameEn',
  NAME_BN = 'nameBn',
  LOGIN_EMAIL = 'loginEmail',
  CREATED_AT = 'createdAt',
  LAST_LOGIN_AT = 'lastLoginAt',
}

export class UsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'rahim',
    description:
      'Searches nameBn, nameEn, loginEmail and mobile (Bangla digits allowed)',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(100, { message: 'খোঁজার শব্দ খুব দীর্ঘ।' })
  q?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ উইং আইডি।' })
  wingId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ পদবি আইডি।' })
  designationId?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole, { message: 'অবৈধ ভূমিকা।' })
  role?: UserRole;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'isActive true অথবা false হতে হবে।' })
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: UserSortField,
    default: UserSortField.PRIORITY,
    description: 'priority = designation priority (then English name)',
  })
  @IsOptional()
  @IsEnum(UserSortField, { message: 'অবৈধ sortBy মান।' })
  sortBy: UserSortField = UserSortField.PRIORITY;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortOrder asc অথবা desc হতে হবে।' })
  sortOrder: 'asc' | 'desc' = 'asc';
}

export class DirectoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'রহিম',
    description: 'Searches nameBn and nameEn only',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(100, { message: 'খোঁজার শব্দ খুব দীর্ঘ।' })
  q?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'অবৈধ উইং আইডি।' })
  wingId?: string;
}
