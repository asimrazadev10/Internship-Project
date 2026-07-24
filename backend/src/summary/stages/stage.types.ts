import type { BroadcastMessage } from '../../messages/message-events';

/** generate-ai-summary's return value, read by save-summary via job.getChildrenValues(). */
export type GenerateResult =
  | { skipped: true; reason: 'exists' | 'empty' | 'blank' }
  | { skipped: false; groupId: string; summaryText: string };

/** save-summary's return value, read by publish-summary. */
export type SaveResult =
  | { skipped: true }
  | { skipped: false; message: BroadcastMessage };
