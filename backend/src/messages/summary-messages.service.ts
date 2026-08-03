/**
 * HOW THIS FILE WORKS
 *   1. persistAiSummary() — write an AI_SUMMARY row with no sender, and emit NOTHING.
 *   2. findForSummary() — the window's USER messages, oldest first, for the transcript.
 *   3. hasSummarySince() — the idempotency guard the fetch stage calls first.
 *
 * Three queries, MongoDB as the only dependency. Called exclusively by SummaryProcessor in
 * the standalone summary worker.
 */
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

import { MessageRepository } from '../common/database/repositories/message.repository';

/**
 * The message queries the AI summary pipeline needs — and nothing else.
 *
 * Split out of MessagesService because the two serve DISJOINT callers in DIFFERENT PROCESSES:
 * every method here is called only by SummaryProcessor, which runs in the standalone summary
 * worker. That was not a stylistic split; it fixed a real wart. MessagesService depends on
 * EventEmitter2, so importing it into the worker forced summary-worker.module to pull in
 * EventEmitterModule purely to satisfy a dependency the worker never used — with a comment
 * apologising for it.
 *
 * This service depends on MessageRepository alone.
 *
 * Note the deliberate asymmetry with MessagesService: `persistAiSummary` writes WITHOUT emitting,
 * while everything in MessagesService emits. Previously those two behaviours sat three lines
 * apart in one file, which is a trap; here the no-emit rule is the whole point of the class and
 * the docblock can say so.
 */
@Injectable()
export class SummaryMessagesService {
  constructor(private readonly messages: MessageRepository) {}

  /**
   * Persist an AI summary as a message with no human sender, WITHOUT broadcasting.
   *
   * In the distributed pipeline the broadcast is a separate stage (publish-summary) running in
   * another process over the Redis emitter, so this write must not emit the in-process
   * MESSAGE_CREATED event: no gateway lives in the worker to receive it, and emitting would risk
   * double-broadcasting once the publish stage runs.
   */
  persistAiSummary(groupId: string, content: string) {
    return this.messages.persistAiSummary(new Types.ObjectId(groupId), content);
  }

  /** The window's USER messages (oldest first) that a summary is built from. */
  findForSummary(groupId: string, since: Date) {
    return this.messages.findForSummary(new Types.ObjectId(groupId), since);
  }

  /** Idempotency guard: has an AI_SUMMARY already been posted for this group in the window? */
  async hasSummarySince(groupId: string, since: Date): Promise<boolean> {
    return this.messages.hasSummarySince(new Types.ObjectId(groupId), since);
  }
}
