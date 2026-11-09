import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { toBoolean, trimText } from '../../../common/dto/transforms';

export class CreateWingDto {
  @ApiProperty({ example: 'কম্পিউটার উইং' })
  @Transform(trimText)
  @IsString({ message: 'বাংলা নাম দিন।' })
  @IsNotEmpty({ message: 'বাংলা নাম দিন।' })
  @MaxLength(200, { message: 'বাংলা নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।' })
  nameBn!: string;

  @ApiProperty({
    example: 'Computer Wing',
    description: 'Unique (case-insensitive)',
  })
  @Transform(trimText)
  @IsString({ message: 'ইংরেজি নাম দিন।' })
  @IsNotEmpty({ message: 'ইংরেজি নাম দিন।' })
  @MaxLength(200, { message: 'ইংরেজি নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।' })
  nameEn!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive true অথবা false হতে হবে।' })
  isActive?: boolean;
}

export class UpdateWingDto extends PartialType(CreateWingDto) {}

export class WingListQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'true = only active wings',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'activeOnly true অথবা false হতে হবে।' })
  activeOnly?: boolean;
}

export class WingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'কম্পিউটার উইং' })
  nameBn!: string;

  @ApiProperty({ example: 'Computer Wing' })
  nameEn!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    example: 23,
    description: 'Users that currently belong to this wing',
  })
  userCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
