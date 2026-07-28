/**
 * HOW THIS FILE WORKS
 *   1. BullMQ hands this processor a generate-ai-summary job from ai-queue.
 *   2. Read the fetch-messages child's return value.
 *   3. If it skipped, propagate the skip and stop.
 *   4. Otherwise send the transcript to Gemini.
 *   5. A blank reply becomes a skip rather than an empty summary row.
 *   6. Return the text for save-summary to read.
 *
 * Stage 2 of 5. Child: fetch-messages. Parent: save-summary.
 */
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { AI_RATE_LIMIT } from '../../ai/ai.constants';
import { AiSummaryService } from '../../ai/ai-summary.service';
import {
  AI_QUEUE,
  concurrencyFor,
  firstChildValue,
  intFromEnv,
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
  // Per-process parallelism (default 10); these jobs are network-bound and mostly idle.
  concurrency: concurrencyFor('AI'),
  limiter: {
    // Max calls per window, counted in Redis across ALL ai-worker instances.
    max: intFromEnv(AI_RATE_LIMIT.max.key, AI_RATE_LIMIT.max.default),
    // The window those calls are counted in (default 60s).
    duration: intFromEnv(
      AI_RATE_LIMIT.duration.key,
      AI_RATE_LIMIT.duration.default,
    ),
  },
})
export class GenerateProcessor extends WorkerHost {
  // Tagged [GenerateProcessor] in the ai-worker's output.
  private readonly logger = new Logger(GenerateProcessor.name);

  // Only dependency: the Gemini wrapper. No PrismaService.
  constructor(private readonly ai: AiSummaryService) {
    super();
  }

  // The single entry point BullMQ calls per job on this queue.
  async process(job: Job<{ groupId: string }>): Promise<GenerateResult> {
    // Step 2. One child, so firstChildValue unwraps the map to a single FetchResult.
    const child = firstChildValue<FetchResult>(await job.getChildrenValues());
    // Step 3. Missing value (defensive) or an upstream skip — either way, nothing to do.
    if (!child || child.skipped) {
      return { skipped: true, reason: child?.reason ?? 'empty' };
    }

    // Step 4. The only network call in the whole pipeline.
    const summaryText = await this.ai.summarize(child.transcript);
    // Step 5. An empty AI_SUMMARY row would be worse than none, so skip instead.
    if (!summaryText) return { skipped: true, reason: 'blank' };

    // Proof in the log that Gemini answered for this group.
    this.logger.log(`group ${child.groupId}: summary generated`);
    // Step 6. Becomes save-summary's child value.
    return { skipped: false, groupId: child.groupId, summaryText };
  }
}
