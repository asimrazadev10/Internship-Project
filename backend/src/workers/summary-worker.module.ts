import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { bullConnectionFactory } from '../config/redis.config';
import { SUMMARY_QUEUE } from '../queues/queue.constants';
import { SummaryProcessor } from '../summary/stages/summary.processor';

// The summary-worker drains summary-queue, handling three jobs (fetch-messages, save-summary, and
// the group-summary parent) via SummaryProcessor. EventEmitterModule satisfies MessagesService's
// EventEmitter2 dependency; save-summary uses persistAiSummary (persist only), so it never fires.
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({ inject: [ConfigService], useFactory: bullConnectionFactory }),
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    MessagesModule,
  ],
  providers: [SummaryProcessor],
})
export class SummaryWorkerModule {}
