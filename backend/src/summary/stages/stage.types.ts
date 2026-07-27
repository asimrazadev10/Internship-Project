import type { BroadcastMessage } from '../../messages/message-events';

/** fetch-messages' return: the window's transcript, or a skip. Read by generate-ai-summary. */
export type FetchResult =
  | { skipped: true; reason: 'exists' | 'empty' }
  | {
      skipped: false;
      groupId: string;
      transcript: { sender: string; content: string }[];
    };

/** generate-ai-summary's return value, read by save-summary. */
export type GenerateResult =
  | { skipped: true; reason: 'exists' | 'empty' | 'blank' }
  | { skipped: false; groupId: string; summaryText: string };

/** save-summary's return value, read by publish-summary. */
export type SaveResult =
  { skipped: true } | { skipped: false; message: BroadcastMessage };

/** publish-summary's return value, read by the group-summary parent. */
export type PublishResult = { published: boolean };
