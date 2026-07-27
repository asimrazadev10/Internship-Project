/**
 * The single response envelope for every endpoint in the API.
 *
 * A client should never have to guess the shape of a response based on which route it hit.
 * One success shape, one error shape, applied globally by a filter and an interceptor rather
 * than by each controller remembering to do it.
 */

export interface PaginationMeta {
  limit: number;
  /** Opaque cursor for the next page; null when the caller has reached the end. */
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta | Record<string, unknown>;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

/**
 * Stable, machine-readable error codes. Clients branch on these; the human-readable
 * `message` is free to change without breaking anyone.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /**
   * A dependency is unavailable — distinct from INTERNAL_ERROR, which means WE broke.
   *
   * Clients branch on this code, and the two demand opposite behaviour: INTERNAL_ERROR is not
   * worth retrying (the same request will fail the same way), while SERVICE_UNAVAILABLE is
   * exactly what a retry is for. Collapsing them into one code, as the status-range fallback
   * did, tells a client to give up on a condition that is usually transient.
   */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Shape a handler returns when it needs to attach pagination metadata to the envelope.
 *
 * Detected structurally rather than with `instanceof`, because the serialization
 * interceptor runs first and replaces class instances with plain objects.
 */
export interface PaginatedPayload<T> {
  data: T;
  meta: PaginationMeta | Record<string, unknown>;
}

export function isPaginatedPayload(
  value: unknown,
): value is PaginatedPayload<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    Object.keys(value).length === 2
  );
}
