import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AiModule } from '../ai/ai.module';
import { GroupsModule } from '../groups/groups.module';
import { MessagesModule } from '../messages/messages.module';
import { SUMMARY_QUEUE } from './summary.constants';
import { SummaryProcessor } from './summary.processor';
import { SummaryScheduler } from './summary.scheduler';
import { SummaryService } from './summary.service';

// SummaryController is created in Task 7 — do NOT reference it here yet, it does not exist.
@Module({
  imports: [
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
    AiModule,
    MessagesModule,
    GroupsModule,
  ],
  providers: [SummaryService, SummaryProcessor, SummaryScheduler],
})
export class SummaryModule {}
