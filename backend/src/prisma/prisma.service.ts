/**
 * HOW THIS FILE WORKS
 *   1. Extend PrismaClient so this class IS the query API.
 *   2. Configure logging in the constructor — warnings and errors only.
 *   3. onModuleInit connects the pool when Nest boots the module.
 *   4. onModuleDestroy closes it cleanly on shutdown.
 *
 * Every process that touches Postgres injects this: the API and the scheduler and summary workers.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Wraps PrismaClient so its connection lifecycle is owned by Nest's DI container rather than
 * by a module-level singleton created at import time.
 *
 * The practical payoff is shutdown: on SIGTERM, Nest calls onModuleDestroy and the pool is
 * closed cleanly. Without that, in-flight queries are severed mid-transaction and Postgres is
 * left reaping connections.
 */
@Injectable()
// Step 1. Extending, not wrapping, so callers write this.prisma.message.findMany() directly.
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // 'query' is deliberately omitted — it logs every statement and buries genuine
      // problems. Turn it on locally when investigating a specific query.
      log: [
        // Step 2. Both go to stdout so container log collection picks them up.
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // Step 3. Connect eagerly so a bad DATABASE_URL fails at boot, not at the first request.
    await this.$connect();
    // The line that confirms Postgres is reachable from this process.
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    // Step 4. Reached only because the entry points call enableShutdownHooks().
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
