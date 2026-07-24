import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { bullConnectionFactory } from '../config/redis.config';
import { SUMMARY_QUEUE } from '../queues/queue.constants';
import { SaveProcessor } from '../summary/stages/save.processor';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({ inject: [ConfigService], useFactory: bullConnectionFactory }),
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    MessagesModule,
  ],
  providers: [SaveProcessor],
})
export class SummaryWorkerModule {}
