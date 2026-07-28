/**
 * HOW THIS FILE WORKS
 *   1. Inject the scheduler queue as a producer.
 *   2. On POST /summaries/run, add one scheduler-tick job.
 *   3. Return 202 Accepted — the work is queued, not done.
 *
 * The only part of the summary feature in the main API process. It enqueues the identical job the
 * repeatable scheduler fires, so the demo path and the production path are the same code.
 */
import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { JOB_SCHEDULER_TICK, SCHEDULER_QUEUE } from '../queues/queue.constants';

/**
 * Manual "run summaries now" trigger — for the demo (you can't wait for the 24h tick). Authenticated
 * (global JwtAuthGuard); it enqueues the same scheduler-tick the repeatable scheduler fires, so the
 * scheduler worker fans out the identical per-group flows.
 */
@Controller('summaries')
export class SummaryController {
  // Step 1. Used only to add(); the worker draining it lives in another process.
  constructor(@InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue) {}

  @Post('run')
  // Step 3. 202 not 200 — the summaries do not exist yet, so the caller cannot be told they do.
  @HttpCode(HttpStatus.ACCEPTED)
  // Sets the `message` field of the standard response envelope.
  @ResponseMessage('Summary run enqueued')
  async run(): Promise<{ enqueued: true }> {
    // Step 2. No jobId passed, so unlike the flow stages this job is never deduplicated.
    await this.queue.add(JOB_SCHEDULER_TICK, {});
    // Wrapped by the interceptor as { success, data, message }.
    return { enqueued: true };
  }
}
