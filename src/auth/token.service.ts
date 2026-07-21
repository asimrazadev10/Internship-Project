import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { parseDurationToMs } from '../common/utils/duration';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokens, JwtPayload } from './interfaces/auth.types';

/**
 * Issues and rotates authentication tokens.
 *
 * Two different token designs, on purpose:
 *
 *   Access token  — a short-lived JWT, signed with JWT_ACCESS_SECRET. Stateless: verified by
 *                   signature alone, never looked up in the database, so protected requests
 *                   cost no query. The price of statelessness is that it cannot be revoked
 *                   before it expires, which is why it is short-lived.
 *
 *   Refresh token — a long-lived opaque random string. The database is the source of truth:
 *                   only a SHA-256 hash is stored, so a database leak yields nothing usable.
 *                   Being stateful, it CAN be revoked — which is what makes real logout and
 *                   reuse detection possible.
 *
 * Rotation with reuse detection: every refresh consumes the presented token and issues a new
 * one in the same `familyId`. If a token that was already consumed is presented again, that
 * means it leaked and is being replayed — so the whole family is revoked, logging out both the
 * attacker and the legitimate user (who then simply logs in again).
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.refreshTtlMs = parseDurationToMs(
      config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
    );
  }

  /**
   * Issue a fresh access + refresh pair for a new session (login, register, google).
   * A new session starts a new rotation family.
   */
  async issueForNewSession(user: User): Promise<AuthTokens> {
    const familyId = randomUUID();
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: await this.persistRefreshToken(user.id, familyId),
    };
  }

  /**
   * Exchange a valid refresh token for a new pair, atomically consuming the old one.
   * Returns the user as well, so the caller can re-issue an access token and shape the response.
   */
  async rotate(rawToken: string): Promise<{ user: User } & AuthTokens> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    // Unknown token — never issued, or already deleted. Nothing to trust.
    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Already consumed or explicitly revoked. Presenting it again is a replay: burn the family.
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn(
        `Refresh token reuse detected for family ${existing.familyId}; family revoked`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
    });
    if (!user) {
      // User deleted since the token was issued.
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Consume-and-reissue in one interactive transaction. The claim is a CONDITIONAL update
    // (revokedAt still null); if a concurrent refresh already consumed this row, claimed.count
    // is 0 and we treat it as reuse. This closes the race where two requests present the same
    // token simultaneously and both try to rotate it.
    const newRawToken = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (claimed.count === 0) {
        return null; // lost the race — handled as reuse below
      }

      const raw = this.generateRawToken();
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(raw),
          familyId: existing.familyId,
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
        },
      });
      return raw;
    });

    if (newRawToken === null) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn(
        `Concurrent refresh reuse for family ${existing.familyId}; family revoked`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return {
      user,
      accessToken: await this.signAccessToken(user),
      refreshToken: newRawToken,
    };
  }

  /**
   * Logout: revoke the whole family the presented token belongs to. Idempotent — an unknown or
   * already-revoked token is a no-op, so a double logout is not an error.
   */
  async revokeByToken(rawToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (existing) {
      await this.revokeFamily(existing.familyId);
    }
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    // Secret and expiry come from JwtModule's registration (JWT_ACCESS_SECRET / _EXPIRES_IN).
    return this.jwt.signAsync(payload);
  }

  private async persistRefreshToken(
    userId: string,
    familyId: string,
  ): Promise<string> {
    const raw = this.generateRawToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(raw),
        familyId,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    return raw;
  }

  private revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** 48 random bytes → ~64 base64url chars. Opaque; the DB row carries the identity. */
  private generateRawToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /**
   * SHA-256, not a slow hash. The token is already 48 bytes of CSPRNG output, so there is no
   * low-entropy secret to brute-force — a memory-hard hash would only add latency to every
   * refresh. Hashing exists here solely so a leaked database table contains no usable tokens.
   */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
