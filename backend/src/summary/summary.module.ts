import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AiModule } from '../ai/ai.module';
import { MessagesModule } from '../messages/messages.module';
import { SUMMARY_QUEUE } from './summary.constants';
import { SummaryController } from './summary.controller';
import { SummaryProcessor } from './summary.processor';
import { SummaryScheduler } from './summary.scheduler';
import { SummaryService } from './summary.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    AiModule,
    MessagesModule,
  ],
  controllers: [SummaryController],
  providers: [SummaryService, SummaryProcessor, SummaryScheduler],
})
export class SummaryModule {}
