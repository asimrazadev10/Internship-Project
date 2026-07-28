/**
 * HOW THIS FILE WORKS
 *   1. issueForNewSession() — start a new rotation family: sign an access token, persist a refresh.
 *   2. rotate() — look the presented token up by hash, then run four checks before reissuing.
 *   3. The reuse check: a row carrying revokedAt means replay, so burn the whole family.
 *   4. The rotation itself is a CONDITIONAL update inside a transaction, closing the race.
 *   5. revokeByToken() — logout; revokes the family, and is idempotent.
 *   6. Private helpers: sign, persist, revokeFamily, generate, hash.
 *
 * Two token designs on purpose — stateless JWT for access, stateful opaque string for refresh.
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { parseDurationToMs } from '../common/utils/duration';
import { PrismaService } from '../prisma/prisma.service';
import {
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_ENCODING,
  REFRESH_TOKEN_HASH_ALGORITHM,
} from './auth.constants';
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
  // Parsed once at construction rather than on every issue.
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // "7d" -> milliseconds. The access token's expiry is handled by JwtModule, not here.
    this.refreshTtlMs = parseDurationToMs(
      config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
    );
  }

  /**
   * Issue a fresh access + refresh pair for a new session (login, register, google).
   * A new session starts a new rotation family.
   */
  async issueForNewSession(user: User): Promise<AuthTokens> {
    // Step 1. A new family id per session, so revoking one login cannot log out another device.
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
    // Step 2. Looked up by hash — the raw token is never stored, so it cannot be searched for.
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    // Unknown token — never issued, or already deleted. Nothing to trust.
    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Already consumed or explicitly revoked. Presenting it again is a replay: burn the family.
    // Step 3. This check is why the purge job must never delete revoked-but-unexpired rows.
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn(
        `Refresh token reuse detected for family ${existing.familyId}; family revoked`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Checked in code rather than in the query, so expiry gets its own distinct message.
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
      // Step 4. `revokedAt: null` in the WHERE is the compare-and-swap that makes this atomic.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (claimed.count === 0) {
        return null; // lost the race — handled as reuse below
      }

      // The replacement joins the SAME family, so the chain stays revocable as a unit.
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

    // null means another request won the claim — indistinguishable from replay, so treat it as one.
    if (newRawToken === null) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn(
        `Concurrent refresh reuse for family ${existing.familyId}; family revoked`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // The user is returned too, so AuthService needs no second lookup.
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
    // Step 5. No error when absent — logging out twice must not fail.
    if (existing) {
      await this.revokeFamily(existing.familyId);
    }
  }

  private signAccessToken(user: User): Promise<string> {
    // Deliberately minimal claims — see JwtPayload for why nothing else is embedded.
    const payload: JwtPayload = { sub: user.id, email: user.email };
    // Secret and expiry come from JwtModule's registration (JWT_ACCESS_SECRET / _EXPIRES_IN).
    return this.jwt.signAsync(payload);
  }

  private async persistRefreshToken(
    userId: string,
    familyId: string,
  ): Promise<string> {
    const raw = this.generateRawToken();
    // Only the hash is stored; `raw` is returned to the caller and never written down.
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
    // `revokedAt: null` in the WHERE keeps the original timestamp on already-revoked rows.
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Opaque CSPRNG output; the DB row carries the identity. Size/encoding: auth.constants.ts. */
  private generateRawToken(): string {
    // randomBytes, not randomUUID — 48 bytes carries far more entropy than a v4 UUID.
    return randomBytes(REFRESH_TOKEN_BYTES).toString(REFRESH_TOKEN_ENCODING);
  }

  /**
   * SHA-256, not a slow hash. The token is already 48 bytes of CSPRNG output, so there is no
   * low-entropy secret to brute-force — a memory-hard hash would only add latency to every
   * refresh. Hashing exists here solely so a leaked database table contains no usable tokens.
   */
  private hashToken(rawToken: string): string {
    // Unsalted on purpose: the lookup is by hash, so the same input must give the same output.
    return createHash(REFRESH_TOKEN_HASH_ALGORITHM)
      .update(rawToken)
      .digest('hex');
  }
}
