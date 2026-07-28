/**
 * HOW THIS FILE WORKS
 *   1. Configure passport-jwt: read the Bearer header, verify the signature, honour expiry.
 *   2. validate() runs only after all of that passes.
 *   3. Its return value becomes request.user.
 *
 * Wired in as the global guard's strategy, so every non-@Public route passes through it.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../interfaces/auth.types';

/**
 * Validates the access token on protected requests.
 *
 * passport-jwt does the heavy lifting declared here: pull the token from the Authorization
 * Bearer header, verify its signature against JWT_ACCESS_SECRET, and reject it if expired
 * (ignoreExpiration: false). validate() only runs once all of that has passed.
 *
 * validate() intentionally does NOT hit the database. The signed, unexpired token is itself the
 * proof of identity; adding a lookup on every protected request would trade the whole point of
 * a stateless access token for a query. Handlers that need the live user row load it explicitly.
 * The cost of this choice is that a token stays valid until it expires even if the user is
 * deleted — which is bounded by the short access-token lifetime and is why refresh tokens,
 * not access tokens, carry revocation.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Step 1. Authorization: Bearer <token> — no cookie or query-string fallback.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Expired tokens are rejected by passport before validate() is reached.
      ignoreExpiration: false,
      // The ACCESS secret specifically — refresh tokens are opaque and never verified here.
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    // The return value becomes request.user, surfaced to handlers via @CurrentUser().
    // Steps 2-3. No database call — see the docblock for why that is deliberate.
    return { userId: payload.sub, email: payload.email };
  }
}
