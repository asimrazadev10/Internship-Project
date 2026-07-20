import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

import { ErrorCode, ErrorCodeValue, ErrorResponse } from '../http/api-response';
import { mapPrismaError } from './prisma-error.mapper';

/**
 * Catch-all filter. Guarantees that nothing escapes the API in a shape a client has not seen
 * before — including errors thrown from places no one anticipated.
 *
 * Note this also handles Prisma errors, duplicating PrismaExceptionFilter's behaviour via the
 * same shared mapper. That is deliberate: it makes correctness independent of the order Nest
 * resolves global filters in, so whichever one wins produces byte-identical output.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.buildError(exception);

    // 5xx means we broke something and need the stack. 4xx is the client's problem and is
    // logged at warn without a stack, so genuine faults stay visible in the noise.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} ${body.error.code}`,
      );
    }

    response.status(status).json(body);
  }

  private buildError(exception: unknown): {
    status: number;
    body: ErrorResponse;
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, code, message } = mapPrismaError(exception);
      return { status, body: { success: false, error: { code, message } } };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    // Anything else is a genuine fault. The internal message is logged above but never
    // returned — error text can leak table names, file paths and query fragments.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
        },
      },
    };
  }

  private fromHttpException(exception: HttpException): {
    status: number;
    body: ErrorResponse;
  } {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    // ValidationPipe throws BadRequestException whose payload carries `message` as an array
    // of constraint strings. Those become `details`, so a client can map failures to fields
    // instead of parsing one concatenated sentence.
    if (
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as { message?: unknown }).message)
    ) {
      return {
        status,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
            details: (payload as { message: unknown[] }).message,
          },
        },
      };
    }

    const message =
      typeof payload === 'string'
        ? payload
        : ((payload as { message?: string }).message ?? exception.message);

    return {
      status,
      body: {
        success: false,
        error: { code: this.codeForStatus(status), message },
      },
    };
  }

  private codeForStatus(status: number): ErrorCodeValue {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? ErrorCode.INTERNAL_ERROR
          : ErrorCode.BAD_REQUEST;
    }
  }
}
