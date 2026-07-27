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
  exports: [RefreshTokenPurgeService],
})
export class RefreshTokenPurgeModule {}
