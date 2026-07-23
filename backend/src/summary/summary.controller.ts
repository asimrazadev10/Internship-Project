import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { JOB_SCHEDULER, SUMMARY_QUEUE } from './summary.constants';

/**
 * Manual "run summaries now" trigger — for the demo (you can't wait for the 24h tick). Authenticated
 * (global JwtAuthGuard); it enqueues the same scheduler job the repeatable tick runs, so it goes
 * through the identical fan-out path.
 */
@Controller('summaries')
export class SummaryController {
  constructor(@InjectQueue(SUMMARY_QUEUE) private readonly queue: Queue) {}

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ResponseMessage('Summary run enqueued')
  async run(): Promise<{ enqueued: true }> {
    await this.queue.add(JOB_SCHEDULER, {});
    return { enqueued: true };
  }
}
