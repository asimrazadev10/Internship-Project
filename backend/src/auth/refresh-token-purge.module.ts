/**
 * HOW THIS FILE WORKS
 *   1. Provide RefreshTokenPurgeService.
 *   2. Export it for the scheduler worker.
 *
 * No imports: PrismaModule is @Global, and this service needs nothing else.
 */
import { Module } from '@nestjs/common';

import { RefreshTokenPurgeService } from './refresh-token-purge.service';

/**
 * A deliberately minimal module so the standalone scheduler worker can run the token purge
 * without importing AuthModule — which would pull in JwtModule, Passport, the strategy, the
 * controller and the global JwtAuthGuard, none of which exist meaningfully in a process with no
 * HTTP server. Same reasoning, and same shape, as SummaryMessagesModule.
 *
 * PrismaModule is global, so this module needs no imports of its own.
 */
@Module({
  providers: [RefreshTokenPurgeService],
  // Step 2. Imported by SchedulerWorkerModule, not by AuthModule.
  exports: [RefreshTokenPurgeService],
})
export class RefreshTokenPurgeModule {}
