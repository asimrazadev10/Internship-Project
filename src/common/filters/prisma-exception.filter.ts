import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

import { ErrorResponse } from '../http/api-response';
import { mapPrismaError } from './prisma-error.mapper';

/**
 * Turns Prisma's known request errors into the standard error envelope.
 *
 * Without this, a duplicate-email registration surfaces as an unhandled 500 with a raw
 * Prisma stack trace. With it, the constraint the database already enforces becomes a
 * correct 409 — meaning the uniqueness rule is expressed once, in the schema, rather than
 * duplicated as a pre-check in every service that writes.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message } = mapPrismaError(exception);

    this.logger.warn(
      `Prisma ${exception.code} on ${request.method} ${request.url} -> ${status}`,
    );

    const body: ErrorResponse = {
      success: false,
      error: { code, message },
    };

    response.status(status).json(body);
  }
}
