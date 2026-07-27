import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SummaryMessagesModule } from '../messages/summary-messages.module';
import { bullConnectionFactory } from '../config/redis.config';
import { SUMMARY_QUEUE } from '../queues/queue.constants';
import { SummaryProcessor } from '../summary/stages/summary.processor';

/**
 * The summary-worker drains summary-queue, handling three jobs (fetch-messages, save-summary, and
 * the group-summary parent) via SummaryProcessor.
 *
 * Imports SummaryMessagesModule rather than MessagesModule: this process needs three Prisma
 * queries — not the HTTP controllers, StorageModule, GroupsModule, or the EventEmitter2 that
 * MessagesService depends on. EventEmitterModule.forRoot() used to be listed here purely to
 * satisfy that unused dependency, with a comment apologising for it. Both are now gone.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    SummaryMessagesModule,
  ],
  providers: [SummaryProcessor],
})
export class SummaryWorkerModule {}
