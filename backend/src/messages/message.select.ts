/**
 * HOW THIS FILE WORKS
 *   1. One Prisma `select` object, shared by both message services.
 *   2. Nested selects for sender and reactions, so neither pulls its whole row.
 */

/**
 * The message shape returned to clients, shared by both message services.
 *
 * Never `include: { sender: true }` — that would pull the sender's password hash into every
 * result. Sender is null for SYSTEM / AI_SUMMARY messages.
 *
 * Extracted when MessagesService was split so the interactive path and the worker-only path
 * cannot drift on the wire payload. `as const` rather than `satisfies`, matching the existing
 * idiom for Prisma selects in this codebase.
 */
export const MESSAGE_SELECT = {
  id: true,
  groupId: true,
  content: true,
  type: true,
  createdAt: true,
  editedAt: true,
  // Present so clients can render "This message was deleted" rather than dropping the row.
  deletedAt: true,
  senderId: true,
  // A nested select, never `true` — id and name only, so the password hash cannot escape.
  sender: { select: { id: true, name: true } },
  // Enough to render the emoji chips and decide whether the current user has reacted.
  reactions: { select: { emoji: true, userId: true } },
  attachmentUrl: true,
  attachmentName: true,
  attachmentMime: true,
} as const;
