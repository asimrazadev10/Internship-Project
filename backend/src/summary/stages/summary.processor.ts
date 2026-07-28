/**
 * HOW THIS FILE WORKS
 *
 *   1. BullMQ hands this processor EVERY job on summary-queue, whatever its name.
 *   2. process() switches on job.name and delegates to one of three private handlers.
 *   3. fetch()        — the flow's LEAF. Reads the window's messages and owns both skip decisions.
 *   4. save()         — persists the generated text as an AI_SUMMARY row. Persist only, no emit.
 *   5. groupSummary() — the flow's ROOT. Does no work; completes once the chain below it is done.
 *
 * The only processor handling more than one job type, because summary-queue carries three of the
 * pipeline's five jobs. That is forced by BullMQ: it distributes work by QUEUE, not by job name,
 * so one WorkerHost receives them all and must dispatch itself.
 *
 * Note the two handlers sit at OPPOSITE ends of the flow — fetch runs first of all five stages,
 * groupSummary last — even though they live in the same class.
 */
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { TRANSCRIPT_UNKNOWN_SENDER } from '../../ai/ai.constants';
import { SummaryMessagesService } from '../../messages/summary-messages.service';
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
  // Default 5 — these jobs are short database round-trips, so a middling number keeps the queue
  // moving without opening more Postgres connections than the pool wants.
  concurrency: concurrencyFor('SUMMARY'),
})
export class SummaryProcessor extends WorkerHost {
  // Tagged [SummaryProcessor] in the summary-worker's output.
  private readonly logger = new Logger(SummaryProcessor.name);

  // The narrow query service — three methods, PrismaService as its only dependency.
  constructor(private readonly messages: SummaryMessagesService) {
    super();
  }

  // Step 2. The dispatch table. Return type is `unknown` because the three handlers return three
  // different shapes; each one is precisely typed on its own signature.
  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_FETCH:
        // The cast is safe because buildSummaryFlow is the only producer of this job name, and it
        // always supplies { groupId, since }.
        return this.fetch(job as Job<{ groupId: string; since: string }>);
      case JOB_SAVE:
        return this.save(job);
      case JOB_GROUP_SUMMARY:
        return this.groupSummary(job);
      default:
        // Unknown job name: complete quietly rather than throw. Throwing would fail a job this
        // pipeline never created, and retry it three times for no reason.
        return undefined;
    }
  }

  /** fetch-messages: read the window's transcript; owns the exists/empty skips. */
  private async fetch(
    job: Job<{ groupId: string; since: string }>,
  ): Promise<FetchResult> {
    // Step 3a. Payload set by buildSummaryFlow when the scheduler created this flow.
    const { groupId } = job.data;
    // `since` crossed Redis as an ISO string — JSON has no Date type — so rehydrate it here.
    const since = new Date(job.data.since);

    // Step 3b. The authoritative idempotency guard. Unlike the deterministic jobId trick this one
    // survives a Redis flush, because it asks the database rather than the queue.
    if (await this.messages.hasSummarySince(groupId, since)) {
      return { skipped: true, reason: 'exists' };
    }
    // Step 3c. The window's USER messages, oldest first.
    const rows = await this.messages.findForSummary(groupId, since);
    // A group with no activity in the window is skipped here, so it never reaches Gemini.
    if (rows.length === 0) return { skipped: true, reason: 'empty' };

    // Step 3d. Reduce Prisma rows to the two fields the model needs. Doing it here keeps DB row
    // shapes out of the ai-worker entirely.
    const transcript = rows.map((r) => ({
      // A deleted author leaves senderId null (onDelete: SetNull), so fall back to a constant
      // shared with the AI stage rather than crashing or emitting "undefined".
      sender: r.sender?.name ?? TRANSCRIPT_UNKNOWN_SENDER,
      content: r.content,
    }));
    // Read by generate-ai-summary as its child value.
    return { skipped: false, groupId, transcript };
  }

  /** save-summary: persist the generated summary as an AI_SUMMARY row (persist only). */
  private async save(job: Job): Promise<SaveResult> {
    // Step 4a. This job's child is generate-ai-summary, which ran in the ai-worker process.
    const child = firstChildValue<GenerateResult>(
      await job.getChildrenValues(),
    );
    // Any upstream skip ends the chain's real work here; publish will see skipped too.
    if (!child || child.skipped) return { skipped: true };

    // Step 4b. Writes WITHOUT emitting an in-process event. That asymmetry is the whole reason
    // SummaryMessagesService exists — broadcasting is stage 5's job, in another process.
    const message = await this.messages.persistAiSummary(
      child.groupId,
      child.summaryText,
    );
    // Logs the new row id, which is the handle for finding the summary in Postgres afterwards.
    this.logger.log(
      `group ${child.groupId}: summary persisted (${message.id})`,
    );
    // Returned in full so publish-summary can broadcast without re-reading the database.
    return { skipped: false, message };
  }

  /** group-summary (root): completes once publish — and thus the whole chain — is done. */
  private async groupSummary(
    job: Job,
  ): Promise<{ done: true; published: boolean }> {
    // Step 5. The root exists purely so the flow has ONE node that finishes last. BullMQ will not
    // run it until publish-summary has succeeded, which makes its completion the signal that the
    // entire five-stage chain is done — the natural place to hang monitoring.
    const child = firstChildValue<PublishResult>(await job.getChildrenValues());
    // `?? false` covers a skipped chain, where publish returned published:false.
    return { done: true, published: child?.published ?? false };
  }
}
