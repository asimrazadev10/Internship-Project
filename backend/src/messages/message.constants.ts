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
