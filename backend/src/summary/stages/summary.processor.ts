import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { MessagesService } from '../../messages/messages.service';
import {
  SUMMARY_QUEUE,
  JOB_FETCH,
  JOB_SAVE,
  JOB_GROUP_SUMMARY,
  concurrencyFromEnv,
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
  concurrency: concurrencyFromEnv('SUMMARY_WORKER_CONCURRENCY', 5),
})
export class SummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(SummaryProcessor.name);

  constructor(private readonly messages: MessagesService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_FETCH:
        return this.fetch(job as Job<{ groupId: string; since: string }>);
      case JOB_SAVE:
        return this.save(job);
      case JOB_GROUP_SUMMARY:
        return this.groupSummary(job);
      default:
        return undefined;
    }
  }

  /** fetch-messages: read the window's transcript; owns the exists/empty skips. */
  private async fetch(
    job: Job<{ groupId: string; since: string }>,
  ): Promise<FetchResult> {
    const { groupId } = job.data;
    const since = new Date(job.data.since);

    if (await this.messages.hasSummarySince(groupId, since)) {
      return { skipped: true, reason: 'exists' };
    }
    const rows = await this.messages.findForSummary(groupId, since);
    if (rows.length === 0) return { skipped: true, reason: 'empty' };

    const transcript = rows.map((r) => ({
      sender: r.sender?.name ?? 'Unknown',
      content: r.content,
    }));
    return { skipped: false, groupId, transcript };
  }

  /** save-summary: persist the generated summary as an AI_SUMMARY row (persist only). */
  private async save(job: Job): Promise<SaveResult> {
    const child = firstChildValue<GenerateResult>(await job.getChildrenValues());
    if (!child || child.skipped) return { skipped: true };

    const message = await this.messages.persistAiSummary(
      child.groupId,
      child.summaryText,
    );
    this.logger.log(`group ${child.groupId}: summary persisted (${message.id})`);
    return { skipped: false, message };
  }

  /** group-summary (root): completes once publish — and thus the whole chain — is done. */
  private async groupSummary(
    job: Job,
  ): Promise<{ done: true; published: boolean }> {
    const child = firstChildValue<PublishResult>(await job.getChildrenValues());
    return { done: true, published: child?.published ?? false };
  }
}
