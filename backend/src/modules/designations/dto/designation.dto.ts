import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toBoolean, trimText } from '../../../common/dto/transforms';

export class CreateDesignationDto {
  @ApiProperty({ example: 'উপপরিচালক' })
  @Transform(trimText)
  @IsString({ message: 'বাংলা নাম দিন।' })
  @IsNotEmpty({ message: 'বাংলা নাম দিন।' })
  @MaxLength(150, { message: 'বাংলা নাম সর্বোচ্চ ১৫০ অক্ষরের হতে পারে।' })
  nameBn!: string;

  @ApiProperty({
    example: 'Deputy Director',
    description: 'Unique (case-insensitive)',
  })
  @Transform(trimText)
  @IsString({ message: 'ইংরেজি নাম দিন।' })
  @IsNotEmpty({ message: 'ইংরেজি নাম দিন।' })
  @MaxLength(150, { message: 'ইংরেজি নাম সর্বোচ্চ ১৫০ অক্ষরের হতে পারে।' })
  nameEn!: string;

  @ApiProperty({
    example: 6,
    minimum: 1,
    maximum: 999,
    description: 'Lower number = higher meeting priority',
  })
  @IsInt({ message: 'অগ্রাধিকার একটি পূর্ণসংখ্যা হতে হবে।' })
  @Min(1, { message: 'অগ্রাধিকার কমপক্ষে ১ হতে হবে।' })
  @Max(999, { message: 'অগ্রাধিকার সর্বোচ্চ ৯৯৯ হতে পারে।' })
  priority!: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive true অথবা false হতে হবে।' })
  isActive?: boolean;
}

/**
 * Any subset of the fields. Changing `priority` affects only meetings created afterwards;
 * stored meeting priorities are snapshots and never change (SPEC.md §6.3).
 */
export class UpdateDesignationDto extends PartialType(CreateDesignationDto) {}

export class DesignationListQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'true = only active designations (for pickers)',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'activeOnly true অথবা false হতে হবে।' })
  activeOnly?: boolean;
}

export class DesignationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'উপপরিচালক' })
  nameBn!: string;

  @ApiProperty({ example: 'Deputy Director' })
  nameEn!: string;

  @ApiProperty({ example: 6 })
  priority!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    example: 41,
    description: 'Users that currently have this designation',
  })
  userCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
