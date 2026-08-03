/**
 * HOW THIS FILE WORKS
 *   1. UUID_RE — the 8-4-4-4-12 hex shape, with no version digit constraint.
 *   2. isUuid() — a type guard, so a passing value narrows to string.
 */

/**
 * Lenient UUID format check — accepts ANY version, including v7.
 *
 * Why this exists instead of Nest's built-in ParseUUIDPipe: that pipe (via class-validator's
 * isUUID) defaults to validating versions 3, 4 and 5. This project's ids are UUIDv7, so the
 * built-in pipe would reject every real id as malformed. This regex checks only the structural
 * shape (8-4-4-4-12 hex), which is all we need to keep a bad path param from reaching a
 * Postgres `uuid` column and throwing a low-level error.
 */
// No version nibble in the pattern — that omission is what makes it accept v7.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `value is string` lets callers use the result to narrow, not just to branch.
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

// 24 hex chars - the MongoDB ObjectId format used for every id since the uuid->ObjectId
// migration. Matching a strict subset of the uuid shape; a 24-hex ObjectId is not a UUID but
// is the format the routes now receive.
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_RE.test(value);
}

// True for either the ObjectId or the legacy UUID form, so route/guard id validation keeps
// accepting valid ids after the format change.
export function isValidDbId(value: unknown): value is string {
  return isUuid(value) || isObjectId(value);
}
