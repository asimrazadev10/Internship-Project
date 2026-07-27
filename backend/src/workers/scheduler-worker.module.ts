import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { bullConnectionFactory } from '../config/redis.config';
import { SCHEDULER_QUEUE, SUMMARY_FLOW } from '../queues/queue.constants';
import { SchedulerProcessor } from '../summary/stages/scheduler.processor';
import { SummaryService } from '../summary/summary.service';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    BullModule.registerQueue({ name: SCHEDULER_QUEUE }),
    BullModule.registerFlowProducer({ name: SUMMARY_FLOW }),
  ],
  providers: [SchedulerProcessor, SummaryService],
})
export class SchedulerWorkerModule {}
