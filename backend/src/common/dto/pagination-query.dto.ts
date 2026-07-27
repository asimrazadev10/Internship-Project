import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../pagination.constants';

/**
 * Query parameters for cursor-paginated list endpoints.
 *
 * `limit` is capped so a client cannot request an unbounded page (a cheap way to strain the DB
 * and the response). `cursor` is the opaque token from the previous page's `nextCursor`; its
 * absence means "first page".
 *
 * @Type(() => Number) is required because query params arrive as strings — without it @IsInt
 * would reject "20". This is exactly why enableImplicitConversion is left off globally: the
 * conversion is declared explicitly, per field.
 */
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  cursor?: string;
}
