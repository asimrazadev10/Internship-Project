/**
 * HOW THIS FILE WORKS
 *   1. BullMQ hands this processor every job on summary-queue, whatever its name.
 *   2. process() switches on job.name and delegates to one of three handlers.
 *   3. fetch() — the flow's leaf; reads the window's messages, owns both skip decisions.
 *   4. save() — persists the generated text as an AI_SUMMARY row. No broadcast.
 *   5. groupSummary() — the flow's root; does no work, completes once the chain is done.
 *
 * The only processor handling more than one job type, because BullMQ distributes work by QUEUE,
 * not by job name. Note fetch and groupSummary sit at opposite ends of the flow.
 */
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { TRANSCRIPT_UNKNOWN_SENDER } from '../../ai/ai.constants';
import { SummaryMessagesService } from '../../messages/summary-messages.service';
import {
  BroadcastMessage,
  PopulatedMessage,
} from '../../messages/message-events';
import {
  SUMMARY_QUEUE,
  JOB_FETCH,
  JOB_SAVE,
  JOB_GROUP_SUMMARY,
  concurrencyFor,
  firstChildValue,
} from '../../queues/queue.constants';
import type {
  FetchResult,
  GenerateResult,
  SaveResult,
  PublishResult,
} from './stage.types';

/**
 * The summary-worker drains summary-queue, which carries THREE of the pipeline's jobs. There is one
 * WorkerHost per queue (BullMQ distributes jobs by queue, not by job name), so this processor
 * switches on job.name:
 *   - fetch-messages (leaf): the DB read + the exists/empty skip decisions
 *   - save-summary:          persist the AI_SUMMARY row (persist only — no broadcast)
 *   - group-summary (root):  the flow's parent; completes once the whole chain has finished
 */
@Processor(SUMMARY_QUEUE, {
  // Default 5 — short DB round-trips, bounded by what the Postgres pool wants.
  concurrency: concurrencyFor('SUMMARY'),
})
export class SummaryProcessor extends WorkerHost {
  // Tagged [SummaryProcessor] in the summary-worker's output.
  private readonly logger = new Logger(SummaryProcessor.name);

  // The narrow query service — three methods, PrismaService as its only dependency.
  constructor(private readonly messages: SummaryMessagesService) {
    super();
  }

  // Step 2. `unknown` because the three handlers return three different shapes.
  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_FETCH:
        // Safe cast: buildSummaryFlow is the only producer of this job name.
        return this.fetch(job as Job<{ groupId: string; since: string }>);
      case JOB_SAVE:
        return this.save(job);
      case JOB_GROUP_SUMMARY:
        return this.groupSummary(job);
      default:
        // Complete quietly rather than fail a job this pipeline never created.
        return undefined;
    }
  }

  /** fetch-messages: read the window's transcript; owns the exists/empty skips. */
  private async fetch(
    job: Job<{ groupId: string; since: string }>,
  ): Promise<FetchResult> {
    // Step 3a. Payload set by buildSummaryFlow when the scheduler created this flow.
    const { groupId } = job.data;
    // JSON has no Date type, so `since` crossed Redis as an ISO string.
    const since = new Date(job.data.since);

    // Step 3b. The authoritative idempotency guard — survives a Redis flush, unlike jobId dedup.
    if (await this.messages.hasSummarySince(groupId, since)) {
      return { skipped: true, reason: 'exists' };
    }
    // Step 3c. The window's USER messages, oldest first.
    const rows = await this.messages.findForSummary(groupId, since);
    // An inactive group is skipped here, so it never reaches Gemini.
    if (rows.length === 0) return { skipped: true, reason: 'empty' };

    // Step 3d. Reduce to the two fields the model needs; no row shapes cross to the ai-worker.
    const transcript = rows.map((r: PopulatedMessage) => ({
      // A deleted author leaves sender null (onDelete: SetNull), so fall back to a shared constant.
      sender: r.sender?.name ?? TRANSCRIPT_UNKNOWN_SENDER,
      content: r.content,
    }));
    // Read by generate-ai-summary as its child value.
    return { skipped: false, groupId, transcript };
  }

  /** save-summary: persist the generated summary as an AI_SUMMARY row (persist only). */
  private async save(job: Job): Promise<SaveResult> {
    // Step 4a. This job's child is generate-ai-summary, which ran in the ai-worker.
    const child = firstChildValue<GenerateResult>(
      await job.getChildrenValues(),
    );
    // Any upstream skip ends the real work here; publish will see skipped too.
    if (!child || child.skipped) return { skipped: true };

    // Step 4b. Writes WITHOUT emitting — broadcasting is stage 5's job, in another process.
    const message = await this.messages.persistAiSummary(
      child.groupId,
      child.summaryText,
    );
    // Logs the new row id, the handle for finding the summary in MongoDB.
    this.logger.log(
      `group ${child.groupId}: summary persisted (${message.id})`,
    );
    // Returned in full so publish can broadcast without re-reading the database.
    return { skipped: false, message: this.toBroadcastMessage(message) };
  }

  /** group-summary (root): completes once publish — and thus the whole chain — is done. */
  private async groupSummary(
    job: Job,
  ): Promise<{ done: true; published: boolean }> {
    // Step 5. Exists so the flow has one node that finishes last — the place to hang monitoring.
    const child = firstChildValue<PublishResult>(await job.getChildrenValues());
    // `?? false` covers a skipped chain, where publish returned published:false.
    return { done: true, published: child?.published ?? false };
  }

  private toBroadcastMessage(message: PopulatedMessage): BroadcastMessage {
    return {
      id: message._id.toString(),
      groupId: message.groupId.toString(),
      content: message.content,
      type: message.type,
      createdAt: message.createdAt,
      editedAt: message.editedAt ?? null,
      deletedAt: message.deletedAt ?? null,
      senderId: message.senderId?.toString() ?? null,
      sender: message.sender
        ? { id: message.sender._id.toString(), name: message.sender.name }
        : null,
      reactions: [],
      attachmentUrl: message.attachmentUrl ?? null,
      attachmentName: message.attachmentName ?? null,
      attachmentMime: message.attachmentMime ?? null,
    };
  }
}
