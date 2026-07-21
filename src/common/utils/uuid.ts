/**
 * Lenient UUID format check — accepts ANY version, including v7.
 *
 * Why this exists instead of Nest's built-in ParseUUIDPipe: that pipe (via class-validator's
 * isUUID) defaults to validating versions 3, 4 and 5. This project's ids are UUIDv7, so the
 * built-in pipe would reject every real id as malformed. This regex checks only the structural
 * shape (8-4-4-4-12 hex), which is all we need to keep a bad path param from reaching a
 * Postgres `uuid` column and throwing a low-level error.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
