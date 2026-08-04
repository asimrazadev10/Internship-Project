/**
 * HOW THIS FILE WORKS
 *   1. Register all four queues in the API process, so the dashboard can see them.
 *   2. Mount @bull-board/nestjs at /admin/queues behind HTTP basic auth.
 *   3. Expose each queue to the board via BullMQAdapter.
 *
 * The workers consume these same queues in their own processes; BullMQ queues are Redis-backed,
 * so a Queue instance in the API and a Worker in a separate process observe the same data. The
 * API normally registers only the scheduler queue (as a producer); this module registers the
 * other three purely so the board can render them.
 */
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestHandler } from 'express';
import basicAuth from 'express-basic-auth';

import {
  AI_QUEUE,
  NOTIFICATION_QUEUE,
  SCHEDULER_QUEUE,
  SUMMARY_QUEUE,
} from '../queues/queue.constants';

/**
 * The BullMQ web dashboard (bull-board) and the queue registrations it renders.
 *
 * Credentials come from BOARDS_USER / BOARDS_PASSWORD. Defaulting the password to undefined keeps
 * the board locked until someone deliberately sets one, instead of shipping a well-known secret.
 */
@Module({
  imports: [
    // Step 1. All four queues, so the board shows every worker's work stream.
    BullModule.registerQueue(
      { name: SCHEDULER_QUEUE },
      { name: AI_QUEUE },
      { name: SUMMARY_QUEUE },
      { name: NOTIFICATION_QUEUE },
    ),
    // Step 2. The board itself.
    BullBoardModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const user = config.getOrThrow<string>('BOARDS_USER');
        const password = config.get<string>('BOARDS_PASSWORD');
        const users = password ? { [user]: password } : {};
        const middleware: RequestHandler = basicAuth({
          challenge: true,
          users,
        });
        return {
          route: '/admin/queues',
          adapter: ExpressAdapter,
          middleware,
        };
      },
    }),
    // Step 3. One board entry per queue.
    BullBoardModule.forFeature(
      { name: SCHEDULER_QUEUE, adapter: BullMQAdapter },
      { name: AI_QUEUE, adapter: BullMQAdapter },
      { name: SUMMARY_QUEUE, adapter: BullMQAdapter },
      { name: NOTIFICATION_QUEUE, adapter: BullMQAdapter },
    ),
  ],
})
export class QueueBoardModule {}
