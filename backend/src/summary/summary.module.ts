/**
 * HOW THIS FILE WORKS
 *   1. Register scheduler-queue so the controller can inject it.
 *   2. Declare SummaryController, the POST /summaries/run route.
 *
 * Note what is absent: no providers and no @Processor. Registering a queue makes this a PRODUCER
 * only — the API enqueues a tick but performs none of the pipeline work.
 */
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
  // Step 1. The root BullMQ connection is configured once in AppModule, not repeated here.
  imports: [BullModule.registerQueue({ name: SCHEDULER_QUEUE })],
  // Step 2. The only thing this module contributes is one route.
  controllers: [SummaryController],
})
export class SummaryModule {}
