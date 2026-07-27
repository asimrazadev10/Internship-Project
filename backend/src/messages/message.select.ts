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
  deletedAt: true,
  senderId: true,
  sender: { select: { id: true, name: true } },
  reactions: { select: { emoji: true, userId: true } },
  attachmentUrl: true,
  attachmentName: true,
  attachmentMime: true,
} as const;
