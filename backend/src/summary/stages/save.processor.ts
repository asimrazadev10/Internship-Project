import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { MessagesService } from '../../messages/messages.service';
import {
  SUMMARY_QUEUE,
  concurrencyFromEnv,
  firstChildValue,
} from '../../queues/queue.constants';
import type { GenerateResult, SaveResult } from './stage.types';

/**
 * Stage 2: persist the generated summary as an AI_SUMMARY row — persist ONLY, no broadcast (that is
 * stage 3, cross-process). Reads the leaf's return value; if generate skipped, this passes the skip
 * up so publish also no-ops. Running before publish enforces persist-then-broadcast ordering.
 */
@Processor(SUMMARY_QUEUE, {
  concurrency: concurrencyFromEnv('SUMMARY_WORKER_CONCURRENCY', 5),
})
export class SaveProcessor extends WorkerHost {
  private readonly logger = new Logger(SaveProcessor.name);

  constructor(private readonly messages: MessagesService) {
    super();
  }

  async process(job: Job<{ groupId: string }>): Promise<SaveResult> {
    const child = firstChildValue<GenerateResult>(await job.getChildrenValues());
    if (!child || child.skipped) return { skipped: true };

    const message = await this.messages.persistAiSummary(child.groupId, child.summaryText);
    this.logger.log(`group ${child.groupId}: summary persisted (${message.id})`);
    return { skipped: false, message };
  }
}
