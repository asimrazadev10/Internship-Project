/**
 * HOW THIS FILE WORKS
 *   1. catch() builds the error body, then decides how loudly to log it.
 *   2. 5xx is logged with a stack as a fault; 4xx (and 503) at warn without one.
 *   3. buildError() dispatches on the exception type: MongoDB, HttpException, or unknown.
 *   4. fromHttpException() lifts ValidationPipe's message array into `details`.
 *   5. codeForStatus() maps an HTTP status to the stable machine-readable code.
 *
 * The ONLY global filter — @Catch() with no argument catches everything.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MongoServerError } from 'mongodb';

import { ErrorCode, ErrorCodeValue, ErrorResponse } from '../http/api-response';

/**
 * Catch-all filter. Guarantees that nothing escapes the API in a shape a client has not seen
 * before — including errors thrown from places no one anticipated.
 *
 * This is the ONLY global filter. `@Catch()` with no argument catches everything,
 * MongoDB included, so nothing is left uncovered.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Step 1. Shape first, then log — the body's code appears in the log line below.
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
      // The stack is the point here — this is something the team has to go and fix.
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      // Name the MongoDB code when there is one — a bare "409 CONFLICT" does not say which
      // constraint tripped, and that is usually the whole question.
      const mongoCode =
        exception instanceof MongoServerError
          ? ` (Mongo ${exception.code})`
          : '';
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} ${body.error.code}${mongoCode}`,
      );
    }

    // Written directly to the Express response — a filter bypasses the interceptor entirely.
    response.status(status).json(body);
  }

  private buildError(exception: unknown): {
    status: HttpStatus;
    body: ErrorResponse;
  } {
    // Step 3. MongoDB first, since a MongoDB error is not an HttpException.
    if (exception instanceof MongoServerError) {
      const { status, code, message } = this.mapMongoError(exception);
      return { status, body: { success: false, error: { code, message } } };
    }

    // Everything the app throws deliberately (NotFound, Forbidden, Conflict) lands here.
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

  private mapMongoError(exception: MongoServerError): {
    status: HttpStatus;
    code: string;
    message: string;
  } {
    // 11000 = duplicate key error
    if (exception.code === 11000) {
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'A record with this value already exists',
      };
    }

    // Other MongoDB errors default to internal
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Database error occurred',
    };
  }

  private fromHttpException(exception: HttpException): {
    status: HttpStatus;
    body: ErrorResponse;
  } {
    const status = exception.getStatus();
    const payload = exception.getResponse();

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
