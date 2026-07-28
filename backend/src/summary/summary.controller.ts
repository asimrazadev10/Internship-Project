/**
 * HOW THIS FILE WORKS
 *
 *   1. Inject the scheduler queue as a PRODUCER (this process consumes nothing).
 *   2. On POST /summaries/run, add one scheduler-tick job to that queue.
 *   3. Return 202 Accepted immediately — the work has been queued, not done.
 *
 * The only part of the summary feature that lives in the main API process. It performs no
 * pipeline work itself; it just enqueues the identical job the repeatable scheduler fires, so the
 * manual demo path and the scheduled production path exercise exactly the same code.
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
  // Step 1. A Queue handle used only to add(). The worker that drains it lives in another process.
  constructor(@InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue) {}

  @Post('run')
  // Step 3. 202, not 200: correct semantics for work that has been accepted but not completed.
  // The caller cannot be told the summaries exist, because at this point they do not.
  @HttpCode(HttpStatus.ACCEPTED)
  // Sets the `message` field of the standard envelope produced by the response interceptor.
  @ResponseMessage('Summary run enqueued')
  async run(): Promise<{ enqueued: true }> {
    // Step 2. Same job name and same empty payload the repeatable scheduler uses, so the
    // scheduler worker cannot tell a manual run from a scheduled one — and does not need to.
    // No jobId is passed, so unlike the flow stages this job is never deduplicated.
    await this.queue.add(JOB_SCHEDULER_TICK, {});
    // The response body; the interceptor wraps it as { success, data, message }.
    return { enqueued: true };
  }
}
