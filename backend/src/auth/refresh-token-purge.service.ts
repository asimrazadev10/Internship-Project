import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

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
 * has any use for. This class depends on PrismaService alone.
 */
@Injectable()
export class RefreshTokenPurgeService {
  private readonly logger = new Logger(RefreshTokenPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Delete every token whose expiry is older than the grace period. Returns how many went. */
  async purgeExpired(): Promise<number> {
    const graceMs = this.config.getOrThrow<number>(
      'REFRESH_TOKEN_PURGE_GRACE_MS',
    );
    const cutoff = new Date(Date.now() - graceMs);

    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });

    // Logged even at zero: a purge that silently stops running is otherwise invisible, and this
    // line is the only evidence the schedule is alive.
    this.logger.log(
      `refresh-token purge: ${count} row(s) expired before ${cutoff.toISOString()}`,
    );
    return count;
  }
}
