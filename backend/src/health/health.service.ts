/**
 * HOW THIS FILE WORKS
 *   1. check() runs the database and Redis probes in parallel and returns a name -> state map.
 *   2. The database probe issues SELECT 1 through Prisma.
 *   3. The Redis probe PINGs the ioredis client BullMQ already holds.
 *   4. probe() wraps either call in a timeout, so a hanging dependency reports 'down' quickly.
 *
 * Hand-rolled rather than pulling in @nestjs/terminus — two checks, a dozen lines.
 */
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULER_QUEUE } from '../queues/queue.constants';
import { DEPENDENCY_CHECK_TIMEOUT_MS } from './health.constants';

// A probe never throws to its caller; it resolves to one of these two states.
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
    // Step 1. Parallel, so the endpoint costs one timeout in total rather than two in sequence.
    const [database, redis] = await Promise.all([
      // Step 2. The cheapest possible round-trip that still proves the pool works.
      this.probe('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('redis', async () => {
        // BullMQ exposes its ioredis client as a promise; it is the live connection, not a copy.
        // Cast because BullMQ types it as IRedisClient, a narrow interface covering only the
        // commands BullMQ itself issues — the object really is an ioredis client, which has ping.
        // Confined to this one line rather than widening the field's type.
        const client = (await this.queue.client) as unknown as {
          ping: () => Promise<string>;
        };
        // Step 3. PING is Redis's own liveness command.
        return client.ping();
      }),
    ]);
    return { database, redis };
  }

  private async probe(
    name: string,
    run: () => Promise<unknown>,
  ): Promise<CheckState> {
    // Held outside the try so `finally` can clear it whichever branch wins.
    let timer: NodeJS.Timeout | undefined;
    try {
      // Step 4. Whichever settles first decides: the real call, or the timeout rejection.
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
      // Logged at warn, not error: a failed probe is a reportable state, not a fault.
      this.logger.warn(
        `readiness: ${name} is down — ${err instanceof Error ? err.message : String(err)}`,
      );
      // Swallowed deliberately so one dead dependency still yields a full report.
      return 'down';
    } finally {
      // Without this the losing timer keeps the event loop alive for its full duration on every
      // successful probe — harmless in a request, but it makes tests hang.
      if (timer) clearTimeout(timer);
    }
  }
}
