/**
 * HOW THIS FILE WORKS
 *   1. KeysetCursor — the (createdAt, id) pair that makes message order a TOTAL order.
 *   2. encodeCursor() — JSON, then base64url, so the client treats it as opaque.
 *   3. decodeCursor() — reverse it, validate both fields, and 400 on anything malformed.
 */
import { BadRequestException } from '@nestjs/common';

/**
 * Opaque cursor encoding for keyset pagination.
 *
 * The cursor carries the two values that make message order a TOTAL order: createdAt (the sort
 * key) and id (the unique tiebreaker, since two messages can share a millisecond). It is
 * base64url of that pair so the client treats it as a black box — the internal keyset can change
 * without breaking any client that just echoes `nextCursor` back.
 *
 * This is NOT encryption. base64 is reversible; the cursor hides nothing secret. It only
 * discourages clients from constructing cursors by hand and coupling to the mechanism.
 */

export interface KeysetCursor {
  createdAt: Date;
  // The tiebreaker: without it, two messages in the same millisecond would be skipped or repeated.
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  // ISO string, because JSON has no Date type and the round-trip must be lossless.
  const payload = JSON.stringify({
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  });
  // base64url, not base64 — the value travels in a query string.
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): KeysetCursor {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    // Typed as unknown, because this input came from the client and could be anything.
    const parsed = JSON.parse(json) as { createdAt?: unknown; id?: unknown };

    const createdAt = new Date(parsed.createdAt as string);
    // Step 3. All three checks matter: a wrong type, or a date string Date could not parse.
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new Error('malformed cursor payload');
    }

    return { createdAt, id: parsed.id };
  } catch {
    // A cursor the client cannot have produced legitimately is a client error, not a 500.
    // The catch also covers base64 and JSON.parse failures, not just the throw above.
    throw new BadRequestException('Invalid pagination cursor');
  }
}
