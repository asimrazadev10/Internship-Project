/**
 * HOW THIS FILE WORKS
 *
 *   1. Declare one return type per pipeline stage, in the order the stages run.
 *   2. Every type is a DISCRIMINATED UNION on `skipped`, so a skip decision made by the first
 *      stage can be recognised and forwarded by every stage after it.
 *   3. Each type names the stage that produces it and the stage that consumes it.
 *
 * The cross-process contract for the summary Flow. These values travel through Redis: a stage
 * returns one, BullMQ stores it, and the parent stage reads it back via getChildrenValues(). That
 * call is untyped at runtime, so these declarations are the only thing keeping the four handoffs
 * honest — the chain is
 *
 *   FetchResult -> GenerateResult -> SaveResult -> PublishResult
 *
 * Narrowing on `skipped` is what lets a processor write `if (child.skipped) return ...` and then
 * safely touch `child.transcript` afterwards; without the union those fields would be optional
 * everywhere and every access would need a non-null assertion.
 */
import type { BroadcastMessage } from '../../messages/message-events';

/** fetch-messages' return: the window's transcript, or a skip. Read by generate-ai-summary. */
export type FetchResult =
  // Two reasons the leaf can bail: a summary already exists for this window, or there were no
  // USER messages to summarize. Both are normal outcomes, NOT errors.
  | { skipped: true; reason: 'exists' | 'empty' }
  | {
      skipped: false;
      groupId: string;
      // Already reduced to what the model needs — no Prisma row shapes cross the process boundary.
      transcript: { sender: string; content: string }[];
    };

/** generate-ai-summary's return value, read by save-summary. */
export type GenerateResult =
  // Inherits fetch's two reasons and adds 'blank': the model answered with an empty string, so
  // there is nothing worth persisting.
  | { skipped: true; reason: 'exists' | 'empty' | 'blank' }
  | { skipped: false; groupId: string; summaryText: string };

/** save-summary's return value, read by publish-summary. */
export type SaveResult =
  // No `reason` here on purpose: by this point the only question the publish stage asks is
  // whether a row exists to broadcast, not why one does not.
  | { skipped: true }
  // The persisted row in broadcast shape, ready to emit without another database read.
  | { skipped: false; message: BroadcastMessage };

/** publish-summary's return value, read by the group-summary parent. */
// The flow root only reports whether the chain ended in a broadcast, so a single flag is enough.
export type PublishResult = { published: boolean };
