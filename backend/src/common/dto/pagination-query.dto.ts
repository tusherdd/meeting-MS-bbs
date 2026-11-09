import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

/** ?page=1&limit=20 — shared by every paginated list. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page একটি পূর্ণসংখ্যা হতে হবে।' })
  @Min(1, { message: 'page কমপক্ষে ১ হতে হবে।' })
  page: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    example: 20,
  })
  @Type(() => Number)
  @IsInt({ message: 'limit একটি পূর্ণসংখ্যা হতে হবে।' })
  @Min(1, { message: 'limit কমপক্ষে ১ হতে হবে।' })
  @Max(MAX_PAGE_SIZE, { message: `limit সর্বোচ্চ ${MAX_PAGE_SIZE} হতে পারে।` })
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
