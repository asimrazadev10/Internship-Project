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
  constructor(@InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue) {}

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ResponseMessage('Summary run enqueued')
  async run(): Promise<{ enqueued: true }> {
    await this.queue.add(JOB_SCHEDULER_TICK, {});
    return { enqueued: true };
  }
}
