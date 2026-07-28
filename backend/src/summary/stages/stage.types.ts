/**
 * HOW THIS FILE WORKS
 *   1. One return type per pipeline stage, in the order the stages run.
 *   2. Each is a discriminated union on `skipped`, so a skip forwards cleanly down the chain.
 *   3. FetchResult -> GenerateResult -> SaveResult -> PublishResult.
 *
 * The cross-process contract. These values travel through Redis and come back via
 * getChildrenValues(), which is untyped at runtime — so these declarations are the only thing
 * keeping the four handoffs honest.
 */
import type { BroadcastMessage } from '../../messages/message-events';

/** fetch-messages' return: the window's transcript, or a skip. Read by generate-ai-summary. */
export type FetchResult =
  // Two normal, non-error outcomes: a summary already exists, or there was nothing to summarize.
  | { skipped: true; reason: 'exists' | 'empty' }
  | {
      skipped: false;
      groupId: string;
      // Already reduced to what the model needs — no Prisma row shapes cross processes.
      transcript: { sender: string; content: string }[];
    };

/** generate-ai-summary's return value, read by save-summary. */
export type GenerateResult =
  // Inherits fetch's reasons and adds 'blank': the model returned an empty string.
  | { skipped: true; reason: 'exists' | 'empty' | 'blank' }
  | { skipped: false; groupId: string; summaryText: string };

/** save-summary's return value, read by publish-summary. */
export type SaveResult =
  // No `reason` here: publish only asks whether a row exists, not why one does not.
  | { skipped: true }
  // The persisted row in broadcast shape, ready to emit without another database read.
  | { skipped: false; message: BroadcastMessage };

/** publish-summary's return value, read by the group-summary parent. */
// The root only reports whether the chain ended in a broadcast, so one flag is enough.
export type PublishResult = { published: boolean };
