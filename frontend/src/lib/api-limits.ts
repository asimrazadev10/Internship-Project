/**
 * Values duplicated from backend validation rules.
 *
 * The frontend and backend are separate npm packages with separate tsconfigs, so these cannot be
 * imported — they are copies. Every entry names the backend source it must be changed alongside.
 * That is the whole point of the file: the duplication is deliberate and documented in one place,
 * rather than scattered as bare literals whose only explanation is a comment somewhere else.
 */

/**
 * Mirrors MESSAGE_CONTENT_MAX_LENGTH in backend/src/messages/message.constants.ts, enforced there
 * by CreateMessageDto's @MaxLength (HTTP) and by ChatGateway.sendMessage (WebSocket).
 */
export const MESSAGE_MAX_LENGTH = 4000;

/**
 * Mirrors ALLOWED_UPLOAD_MIME_TYPES in backend/src/messages/upload.constants.ts.
 *
 * This is the browser file picker's `accept` filter. It is a convenience, NOT a control — the
 * backend re-validates by inspecting the file's actual magic numbers, so a renamed .exe is caught
 * there regardless of what this says. Its only job is to stop the picker offering a file the API
 * will then reject.
 */
export const UPLOAD_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,application/pdf";

/**
 * Mirrors MAX_UPLOAD_MB in backend/src/messages/upload.constants.ts, enforced there by
 * MaxFileSizeValidator. Used only for the tooltip — the real rejection happens server-side.
 */
export const MAX_UPLOAD_MB = 5;

/**
 * Mirrors PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH / EMAIL_MAX_LENGTH in
 * backend/src/auth/auth.constants.ts, enforced there by RegisterDto and LoginDto.
 *
 * The form enforces them so the user is corrected before a round trip rather than after a 400.
 * They must agree with the backend or the form rejects what the API would accept, or vice versa.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

/**
 * Mirrors SEARCH_QUERY_MAX_LENGTH in backend/src/messages/message.constants.ts, enforced there by
 * SearchMessagesDto's @Length. The search input previously had no maxLength at all, so a 101-char
 * query 400'd with nothing in the UI to explain it.
 */
export const SEARCH_MAX_QUERY_LENGTH = 100;
