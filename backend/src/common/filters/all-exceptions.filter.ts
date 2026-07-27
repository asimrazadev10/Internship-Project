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
 * This is the ONLY global filter. A separate PrismaExceptionFilter used to sit beside it, mapping
 * Prisma errors through the same shared mapper to byte-identical output — which meant carrying a
 * comment explaining that their relative precedence did not matter. Deleting it removes the
 * ordering question rather than arguing it. `@Catch()` with no argument catches everything,
 * Prisma included, so nothing is left uncovered.
 *
 * The one thing worth preserving from that filter was its log line, which named the Prisma error
 * code (P2002, P2025). That detail is folded into the warn below — without it, a 409 in the log
 * no longer tells you WHICH constraint tripped.
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
    //
    // 503 is the exception on the 5xx side: it is a signal WE raise deliberately (a readiness
    // probe finding a dependency down, an upstream upload rejecting us), not an unanticipated
    // throw. Its stack points at the line that raised it and says nothing useful. Left in the
    // fault branch, a readiness probe polling every few seconds would bury the logs in stack
    // traces during exactly the incident you need to read them.
    const isFault =
      status >= HttpStatus.INTERNAL_SERVER_ERROR &&
      status !== HttpStatus.SERVICE_UNAVAILABLE;

    if (isFault) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      // Name the Prisma code when there is one — a bare "409 CONFLICT" does not say which
      // constraint tripped, and that is usually the whole question.
      const prismaCode =
        exception instanceof Prisma.PrismaClientKnownRequestError
          ? ` (Prisma ${exception.code})`
          : '';
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} ${body.error.code}${prismaCode}`,
      );
    }

    response.status(status).json(body);
  }

  private buildError(exception: unknown): {
    status: HttpStatus;
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
    status: HttpStatus;
    body: ErrorResponse;
  } {
    // getStatus() is typed as number; every value it returns is an HTTP status, so narrowing to
    // HttpStatus lets the comparisons below share an enum type instead of mixing number/enum.
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

  private codeForStatus(status: HttpStatus): ErrorCodeValue {
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
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? ErrorCode.INTERNAL_ERROR
          : ErrorCode.BAD_REQUEST;
    }
  }
}
