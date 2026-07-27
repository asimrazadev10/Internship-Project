import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ErrorCode, ErrorCodeValue } from '../http/api-response';

export interface MappedPrismaError {
  status: HttpStatus;
  code: ErrorCodeValue;
  message: string;
}

/**
 * Translates Prisma's database-level error codes into HTTP semantics.
 *
 * Kept as a pure function rather than living inside AllExceptionsFilter so the mapping stays
 * independently unit-testable, and so any future consumer (a worker, a different transport) can
 * reuse it without dragging in an HTTP filter.
 *
 * Prisma error code reference: https://www.prisma.io/docs/orm/reference/error-reference
 */
export function mapPrismaError(
  error: Prisma.PrismaClientKnownRequestError,
): MappedPrismaError {
  switch (error.code) {
    // Unique constraint violation — e.g. registering an email that already exists, or
    // joining a group the user is already a member of (@@unique([groupId, userId])).
    case 'P2002': {
      const target = (error.meta?.target as string[] | undefined)?.join(', ');
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: target
          ? `A record with this ${target} already exists`
          : 'A record with these values already exists',
      };
    }

    // An operation depended on a record that does not exist — e.g. updating or deleting by
    // an id that was never there, or that another request removed first.
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
        message: 'The requested record does not exist',
      };

    // Foreign key constraint failure — e.g. posting a message to a group id that does not
    // exist. The caller supplied a bad reference, so this is a client error, not a 500.
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
        message: 'Referenced record does not exist',
      };

    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL_ERROR,
        message: 'A database error occurred',
      };
  }
}
