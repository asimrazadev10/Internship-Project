import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { MessagesModule } from '../messages/messages.module';
import { bullConnectionFactory } from '../config/redis.config';
import { AI_QUEUE } from '../queues/queue.constants';
import { GenerateProcessor } from '../summary/stages/generate.processor';

// EventEmitterModule is imported because MessagesService injects EventEmitter2 in its constructor;
// the generate stage only reads (hasSummarySince/findForSummary), so the emitter is never fired.
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({ inject: [ConfigService], useFactory: bullConnectionFactory }),
    BullModule.registerQueue({ name: AI_QUEUE }),
    AiModule,
    MessagesModule,
  ],
  providers: [GenerateProcessor],
})
export class AiWorkerModule {}
