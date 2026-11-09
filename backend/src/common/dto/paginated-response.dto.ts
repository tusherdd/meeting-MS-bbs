import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  getSchemaPath,
} from '@nestjs/swagger';
import type { PaginationQueryDto } from './pagination-query.dto';

/** Envelope of every paginated list. `items` is typed per endpoint in Swagger. */
export class PaginatedResponseDto<T> {
  items!: T[];

  @ApiProperty({ example: 136, description: 'Total matching rows' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;
}

export function paginated<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQueryDto, 'page' | 'limit'>,
): PaginatedResponseDto<T> {
  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

/** Swagger: 200 response = PaginatedResponseDto with `items` of the given model. */
export const ApiPaginatedResponse = <M extends Type<unknown>>(model: M) =>
  applyDecorators(
    ApiExtraModels(PaginatedResponseDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedResponseDto) },
          {
            properties: {
              items: { type: 'array', items: { $ref: getSchemaPath(model) } },
            },
            required: ['items'],
          },
        ],
      },
    }),
  );
