/**
 * HOW THIS FILE WORKS
 *
 *   1. BullMQ hands this processor a generate-ai-summary job from ai-queue.
 *   2. Read the return value of its ONE child (fetch-messages) via getChildrenValues().
 *   3. If the child skipped — 'exists' or 'empty' — propagate that skip untouched and stop.
 *   4. Otherwise send the transcript to Gemini through AiSummaryService.
 *   5. If the model returns a blank string, skip rather than persist an empty summary.
 *   6. Return the text, which save-summary (this job's parent) reads the same way in step 2.
 *
 * Stage 2 of 5 in the summary Flow. Its child is fetch-messages (summary-queue); its parent is
 * save-summary (summary-queue). Skips travel as VALUES, not exceptions, so a group with nothing
 * to summarize completes cleanly instead of burning retries — see stage.types.ts.
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
  // How many generate jobs this ONE process runs at once (default 10 — these are network-bound
  // and mostly idle, so a high number is cheap).
  concurrency: concurrencyFor('AI'),
  limiter: {
    // Max Gemini calls allowed per `duration`, counted in Redis across ALL ai-worker instances.
    max: intFromEnv(AI_RATE_LIMIT.max.key, AI_RATE_LIMIT.max.default),
    // The window those calls are counted in (default 60_000ms), giving the free-tier 10/minute.
    duration: intFromEnv(
      AI_RATE_LIMIT.duration.key,
      AI_RATE_LIMIT.duration.default,
    ),
  },
})
export class GenerateProcessor extends WorkerHost {
  // Tagged [GenerateProcessor] in the ai-worker's output, which is how you tell the four
  // concurrently-run workers apart in one terminal.
  private readonly logger = new Logger(GenerateProcessor.name);

  // Only dependency: the Gemini wrapper. No PrismaService — that is what "pure AI" means here.
  constructor(private readonly ai: AiSummaryService) {
    super();
  }

  // WorkerHost#process is the single entry point BullMQ calls per job on this queue.
  async process(job: Job<{ groupId: string }>): Promise<GenerateResult> {
    // Step 2. The flow gives every child's return value keyed by job id; this stage has exactly
    // one child, so firstChildValue unwraps that map to the single FetchResult.
    const child = firstChildValue<FetchResult>(await job.getChildrenValues());
    // Step 3. Two cases collapse into one guard: no child value at all (defensive), or the fetch
    // stage decided there was nothing to do. Either way the skip flows on to save/publish.
    if (!child || child.skipped) {
      return { skipped: true, reason: child?.reason ?? 'empty' };
    }

    // Step 4. The only real work in this stage — and the only network call in the whole pipeline.
    const summaryText = await this.ai.summarize(child.transcript);
    // Step 5. A blank completion is not an error, but writing an empty AI_SUMMARY row would be
    // worse than writing nothing, so it becomes a third skip reason.
    if (!summaryText) return { skipped: true, reason: 'blank' };

    // Proof in the log that Gemini actually answered for this group.
    this.logger.log(`group ${child.groupId}: summary generated`);
    // Step 6. Becomes save-summary's `child` on its own call to getChildrenValues().
    return { skipped: false, groupId: child.groupId, summaryText };
  }
}
