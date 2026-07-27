import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '../config/config.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { bullConnectionFactory } from '../config/redis.config';
import { NOTIFICATION_QUEUE } from '../queues/queue.constants';
import { PublishProcessor } from '../summary/stages/publish.processor';

@Module({
  imports: [
    AppConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    NotificationsModule,
  ],
  providers: [PublishProcessor],
})
export class NotificationWorkerModule {}
