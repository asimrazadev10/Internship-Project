/**
 * HOW THIS FILE WORKS
 *   1. Provide NotificationPublisher.
 *   2. Export it so the notification-worker can inject it.
 */
import { Module } from '@nestjs/common';

import { NotificationPublisher } from './notification.publisher';

@Module({
  // Step 1. One instance, which owns a single ioredis client for its lifetime.
  providers: [NotificationPublisher],
  // Step 2. Imported only by NotificationWorkerModule; the API broadcasts via its own gateway.
  exports: [NotificationPublisher],
})
export class NotificationsModule {}
