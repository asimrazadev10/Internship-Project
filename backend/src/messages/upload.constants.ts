/**
 * Attachment upload policy: what may be uploaded, and how large.
 *
 * These are enforced by ParseFilePipe before the handler runs, so a rejected file never reaches
 * StorageService. They live here rather than in the controller because the FRONTEND enforces the
 * same two rules a second time — the composer's `accept` attribute and its tooltip — and those
 * copies had no link back to these. A file the browser happily offers but the API rejects is a
 * confusing dead end for the user; the mirror in frontend/src/lib/api-limits.ts names this file as
 * its source.
 */

/** Hard size cap. Anything larger is rejected with 422 before it is read into storage. */
export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/**
 * The canonical allow-list — images plus PDF. This is the form the frontend mirrors into its
 * `accept` attribute.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;

/**
 * The same allow-list as a RegExp, which is what Nest's FileTypeValidator takes.
 *
 * Deliberately NOT derived from the array above: this pattern also accepts the non-standard
 * `image/jpg` spelling (`jpe?g`), which some clients send. Generating it from the array would
 * silently drop that and start rejecting real uploads. Two spellings, one intent — keep them in
 * step by hand and the comment explains why.
 */
export const ALLOWED_UPLOAD_MIME =
  /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/;
