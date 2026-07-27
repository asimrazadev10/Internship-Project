import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULER_QUEUE } from '../queues/queue.constants';
import { DEPENDENCY_CHECK_TIMEOUT_MS } from './health.constants';

export type CheckState = 'up' | 'down';

export interface ReadinessReport {
  database: CheckState;
  redis: CheckState;
}

/**
 * The dependency probes behind GET /health/ready.
 *
 * Hand-rolled rather than @nestjs/terminus: two checks, a dozen lines. StorageService set this
 * precedent deliberately — it talks to the Storage REST API with `fetch` instead of adding
 * @supabase/supabase-js, for one fewer dependency and a contract visible in one method.
 *
 * Both checks are bounded by a timeout. An unreachable Postgres does not refuse a connection, it
 * fails to answer — so an unbounded probe hangs for as long as the client's own timeout, and a
 * readiness endpoint that hangs is worse than one that says "down": the orchestrator learns
 * nothing and the request occupies a connection while it waits.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    // The queue the API already registers as a producer, so its Redis connection is one this
    // process holds anyway. Opening a second client purely to ping it would mean the probe tested
    // a connection nothing else uses — passing while the real one was broken.
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
  ) {}

  async check(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.probe('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('redis', async () => {
        // BullMQ exposes its ioredis client as a promise; it is the live connection, not a copy.
        // Cast because BullMQ types it as IRedisClient, a narrow interface covering only the
        // commands BullMQ itself issues — the object really is an ioredis client, which has ping.
        // Confined to this one line rather than widening the field's type.
        const client = (await this.queue.client) as unknown as {
          ping: () => Promise<string>;
        };
        return client.ping();
      }),
    ]);
    return { database, redis };
  }

  private async probe(
    name: string,
    run: () => Promise<unknown>,
  ): Promise<CheckState> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        run(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${name} check timed out`)),
            DEPENDENCY_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return 'up';
    } catch (err) {
      this.logger.warn(
        `readiness: ${name} is down — ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'down';
    } finally {
      // Without this the losing timer keeps the event loop alive for its full duration on every
      // successful probe — harmless in a request, but it makes tests hang.
      if (timer) clearTimeout(timer);
    }
  }
}
