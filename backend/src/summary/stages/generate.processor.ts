import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { AiSummaryService } from '../../ai/ai-summary.service';
import {
  AI_QUEUE,
  concurrencyFor,
  firstChildValue,
} from '../../queues/queue.constants';
import type { FetchResult, GenerateResult } from './stage.types';

/**
 * generate-ai-summary (ai-queue). Reads the transcript produced by its fetch-messages child and,
 * if there is one, calls Gemini. All DB reads + exists/empty skips now live in fetch-messages, so
 * this stage is PURE AI — the ai-worker needs no database access at all.
 *
 * `limiter` is Redis-coordinated across every ai-worker instance on this queue — it caps the
 * GLOBAL Gemini call rate for the free tier. `concurrency` alone cannot do this: it only bounds how
 * many jobs run in parallel per PROCESS, so scaling to N ai-worker instances would still let
 * through N * concurrency concurrent Gemini calls with no limiter.
 */
@Processor(AI_QUEUE, {
  concurrency: concurrencyFor('AI'),
  limiter: { max: 10, duration: 60_000 },
})
export class GenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateProcessor.name);

  constructor(private readonly ai: AiSummaryService) {
    super();
  }

  async process(job: Job<{ groupId: string }>): Promise<GenerateResult> {
    const child = firstChildValue<FetchResult>(await job.getChildrenValues());
    if (!child || child.skipped) {
      return { skipped: true, reason: child?.reason ?? 'empty' };
    }

    const summaryText = await this.ai.summarize(child.transcript);
    if (!summaryText) return { skipped: true, reason: 'blank' };

    this.logger.log(`group ${child.groupId}: summary generated`);
    return { skipped: false, groupId: child.groupId, summaryText };
  }
}
