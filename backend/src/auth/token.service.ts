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
import { Types } from 'mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { parseDurationToMs } from '../common/utils/duration';
import { RefreshTokenRepository } from '../common/database/repositories/refresh-token.repository';
import { UserRepository } from '../common/database/repositories/user.repository';
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
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
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
  async issueForNewSession(user: {
    id: string;
    email: string;
  }): Promise<AuthTokens> {
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
  async rotate(
    rawToken: string,
  ): Promise<{ user: { id: string; email: string } } & AuthTokens> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.refreshTokens.findByTokenHash(tokenHash);

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

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

    const user = await this.users.findById(existing.userId.toString());
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRawToken = await this.refreshTokens.withTransaction(async (tx) => {
      const claimed = await this.refreshTokens.claimToken(existing._id, tx);

      if (!claimed) {
        return null;
      }

      const raw = this.generateRawToken();
      await this.refreshTokens.createToken(
        {
          userId: existing.userId,
          tokenHash: this.hashToken(raw),
          familyId: existing.familyId,
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
        },
        tx,
      );
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
      user: { id: user._id.toString(), email: user.email },
      accessToken: await this.signAccessToken({
        id: user._id.toString(),
        email: user.email,
      }),
      refreshToken: newRawToken,
    };
  }

  /**
   * Logout: revoke the whole family the presented token belongs to. Idempotent — an unknown or
   * already-revoked token is a no-op, so a double logout is not an error.
   */
  async revokeByToken(rawToken: string): Promise<void> {
    const existing = await this.refreshTokens.findByTokenHash(
      this.hashToken(rawToken),
    );
    if (existing) {
      await this.revokeFamily(existing.familyId);
    }
  }

  private signAccessToken(user: {
    id: string;
    email: string;
  }): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwt.signAsync(payload);
  }

  private async persistRefreshToken(
    userId: string,
    familyId: string,
  ): Promise<string> {
    const raw = this.generateRawToken();
    await this.refreshTokens.createToken({
      userId: new Types.ObjectId(userId),
      tokenHash: this.hashToken(raw),
      familyId,
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    return raw;
  }

  private revokeFamily(familyId: string): Promise<{ modifiedCount: number }> {
    return this.refreshTokens.revokeFamily(familyId);
  }

  private generateRawToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString(REFRESH_TOKEN_ENCODING);
  }

  private hashToken(rawToken: string): string {
    return createHash(REFRESH_TOKEN_HASH_ALGORITHM)
      .update(rawToken)
      .digest('hex');
  }
}
