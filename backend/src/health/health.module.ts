/**
 * HOW THIS FILE WORKS
 *   1. Register scheduler-queue so HealthService can ping the Redis connection already in use.
 *   2. Declare the controller (two routes) and the service (the probes).
 */
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { SCHEDULER_QUEUE } from '../queues/queue.constants';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Registers the scheduler queue so HealthService can ping the Redis connection this process
 * already holds, rather than opening one of its own. PrismaModule is global, so the database
 * check needs no import.
 */
@Module({
  // Step 1. No PrismaModule needed — it is @Global.
  imports: [BullModule.registerQueue({ name: SCHEDULER_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
