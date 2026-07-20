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
import {
  isPaginatedPayload,
  SuccessResponse,
} from '../http/api-response';

/**
 * Wraps every successful handler return value in the standard envelope.
 *
 * Only the success path goes through here. Errors never reach an interceptor's map operator
 * — they bypass it and are shaped by the exception filters instead. That split is the reason
 * the two shapes stay consistent without either component knowing about the other.
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<unknown>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<unknown>> {
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
