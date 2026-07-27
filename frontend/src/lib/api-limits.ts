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
