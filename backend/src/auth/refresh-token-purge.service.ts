/**
 * HOW THIS FILE WORKS
 *   1. Read the grace period from config.
 *   2. Compute a cutoff: now minus that grace.
 *   3. deleteMany every refresh token that expired before the cutoff.
 *   4. Log the count — even when it is zero.
 *
 * Called by the scheduler worker's second repeatable job. The predicate is expiry-only, never
 * revoked-only, which the docblock below explains.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RefreshTokenRepository } from '../common/database/repositories/refresh-token.repository';

/**
 * Deletes refresh-token rows that are long past expiry.
 *
 * Nothing else ever removed one: `revokeFamily` stamps `revokedAt` and leaves the row, so the
 * table grew by one row per login and one per rotation, forever.
 *
 * WHAT IT DELIBERATELY DOES NOT DELETE: revoked tokens. Reuse detection in TokenService.rotate
 * works by finding a row that still EXISTS carrying `revokedAt` — delete those and a replayed
 * token falls through to "unknown token", the family is never burned, and the warning is never
 * logged. The predicate is expiry-only, with REFRESH_TOKEN_PURGE_GRACE_MS of headroom, and that
 * constant carries the full argument.
 *
 * Lives in its own tiny module rather than on TokenService for the same reason
 * SummaryMessagesService exists: the caller is the standalone scheduler worker, and TokenService
 * drags in JwtService and the whole AuthModule graph — none of which a worker with no HTTP server
 * has any use for. This class depends on RefreshTokenRepository alone.
 */
@Injectable()
export class RefreshTokenPurgeService {
  private readonly logger = new Logger(RefreshTokenPurgeService.name);

  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly config: ConfigService,
  ) {}

  /** Delete every token whose expiry is older than the grace period. Returns how many went. */
  async purgeExpired(): Promise<number> {
    // Step 1. Its own knob, so it is not dragged along by a demo-lowered summary interval.
    const graceMs = this.config.getOrThrow<number>(
      'REFRESH_TOKEN_PURGE_GRACE_MS',
    );
    // Step 2. The headroom is what keeps reuse detection working for recently expired tokens.
    const cutoff = new Date(Date.now() - graceMs);

    // Step 3. Expiry-only predicate — revoked-but-unexpired rows must survive.
    const count = await this.refreshTokens.purgeExpired(graceMs);

    // Logged even at zero: a purge that silently stops running is otherwise invisible, and this
    // line is the only evidence the schedule is alive.
    this.logger.log(
      `refresh-token purge: ${count} row(s) expired before ${cutoff.toISOString()}`,
    );
    return count;
  }
}
