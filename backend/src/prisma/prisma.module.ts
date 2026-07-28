/**
 * HOW THIS FILE WORKS
 *   1. Provide PrismaService.
 *   2. Export it, and mark the module @Global so no feature module has to import it.
 */
import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Marked @Global for the same reason ConfigModule is: database access is cross-cutting
 * infrastructure, not a domain dependency. Making every feature module import PrismaModule
 * would be boilerplate that communicates nothing — the alternative is not stricter
 * boundaries, just a longer imports array in each module.
 *
 * Domain boundaries are still enforced where they matter: feature modules depend on each
 * other's services explicitly, never on each other's tables.
 */
// Step 2. @Global registers the export once, application-wide.
@Global()
@Module({
  // Step 1. One PrismaService instance per process, so one connection pool.
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
