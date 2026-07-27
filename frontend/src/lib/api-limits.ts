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
