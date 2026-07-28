/**
 * HOW THIS FILE WORKS
 *   1. Read any @ResponseMessage() metadata for this handler.
 *   2. Map the handler's return value into the success envelope.
 *   3. A { data, meta } return lifts meta to the envelope's top level.
 *   4. Anything else becomes { success, data }, with undefined normalised to null.
 *
 * Success path only — errors bypass interceptors entirely and are shaped by the filters.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { isPaginatedPayload, SuccessResponse } from '../http/api-response';

/**
 * Wraps every successful handler return value in the standard envelope.
 *
 * Only the success path goes through here. Errors never reach an interceptor's map operator
 * — they bypass it and are shaped by the exception filters instead. That split is the reason
 * the two shapes stay consistent without either component knowing about the other.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<unknown>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<unknown>> {
    // Step 1. Handler first, then controller — same precedence rule as the auth guard.
    const message = this.reflector.getAllAndOverride<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((payload) => {
        // A handler that returns { data, meta } is declaring pagination metadata; lift meta
        // to the envelope's top level rather than nesting it inside data.
        if (isPaginatedPayload(payload)) {
          return {
            success: true as const,
            data: payload.data,
            // Conditional spread, so the key is absent rather than set to undefined.
            ...(message ? { message } : {}),
            meta: payload.meta,
          };
        }

        return {
          success: true as const,
          // undefined would be dropped by JSON.stringify, leaving the key absent entirely.
          // Normalising to null keeps the envelope's shape stable for clients.
          data: payload ?? null,
          ...(message ? { message } : {}),
        };
      }),
    );
  }
}
