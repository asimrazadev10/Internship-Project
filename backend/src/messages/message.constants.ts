/**
 * HOW THIS FILE WORKS
 *   1. MESSAGE_CONTENT_MAX_LENGTH — enforced twice, by the DTO and by the socket handler.
 *   2. SEARCH_RESULT_LIMIT — the hard ceiling on an unpaginated endpoint.
 *   3. SEARCH_QUERY_MIN/MAX_LENGTH — bounds on the query string itself.
 */

/**
 * Message-domain policy limits.
 *
 * MESSAGE_CONTENT_MAX_LENGTH has TWO independent enforcement points, which is why it must be
 * named rather than typed out at each one:
 *   - the HTTP path validates it through CreateMessageDto's @MaxLength, under the global
 *     ValidationPipe;
 *   - the WebSocket path bypasses that pipe entirely (@SubscribeMessage payloads are not
 *     DTO-validated) and checks the length by hand in ChatGateway.sendMessage.
 * Raise one without the other and sockets reject content that REST accepts.
 *
 * The frontend mirrors this in frontend/src/lib/api-limits.ts — separate packages, so no import
 * is possible; the mirror names this file as its source.
 */
export const MESSAGE_CONTENT_MAX_LENGTH = 4000;

/**
 * Hard cap on rows returned by message search.
 *
 * Search is the only message-list endpoint with no cursor pagination, so this is the single thing
 * standing between a one-character query and selecting a whole group's history into memory. The
 * number is arbitrary but the ceiling is not — if search ever needs to page, this is what it
 * replaces.
 */
export const SEARCH_RESULT_LIMIT = 50;

/** Bounds on the search query itself, enforced by SearchMessagesDto and mirrored by the UI. */
// A minimum of 1 stops an empty query being treated as "match everything".
export const SEARCH_QUERY_MIN_LENGTH = 1;
export const SEARCH_QUERY_MAX_LENGTH = 100;
