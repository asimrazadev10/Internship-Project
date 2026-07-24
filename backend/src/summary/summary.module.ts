import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { SCHEDULER_QUEUE } from '../queues/queue.constants';
import { SummaryController } from './summary.controller';

/**
 * Main-app slice of the summary feature: JUST the manual trigger, registered as a PRODUCER on the
 * scheduler queue. All processing (scheduler fan-out + the generate/save/publish stages) now lives
 * in the standalone worker processes under src/workers, so no @Processor is wired here.
 */
@Module({
  imports: [BullModule.registerQueue({ name: SCHEDULER_QUEUE })],
  controllers: [SummaryController],
})
export class SummaryModule {}
