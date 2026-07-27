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
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
