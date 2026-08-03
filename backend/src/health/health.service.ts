/**
 * HOW THIS FILE WORKS
 *   1. check() runs the database and Redis probes in parallel and returns a name -> state map.
 *   2. The database probe issues a ping through MongoDB connection.
 *   3. The Redis probe PINGs the ioredis client BullMQ already holds.
 *   4. probe() wraps either call in a timeout, so a hanging dependency reports 'down' quickly.
 *
 * Hand-rolled rather than pulling in @nestjs/terminus — two checks, a dozen lines.
 */
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';

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
 * Hand-rolled rather than @nestjs/terminus: two checks, a dozen lines.
 *
 * Both checks are bounded by a timeout. An unreachable database does not refuse a connection, it
 * fails to answer — so an unbounded probe hangs for as long as the client's own timeout, and a
 * readiness endpoint that hangs is worse than one that says "down": the orchestrator learns
 * nothing and the request occupies a connection while it waits.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
  ) {}

  async check(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.probe('database', async () => {
        const db = this.connection.db;
        if (!db) throw new Error('MongoDB connection not established');
        return db.admin().ping();
      }),
      this.probe('redis', async () => {
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
      if (timer) clearTimeout(timer);
    }
  }
}
