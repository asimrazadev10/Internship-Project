/**
 * HOW THIS FILE WORKS
 *   1. verify() calls verifySignatureAndAudience() for the checks the library performs.
 *   2. Check the `iss` claim explicitly — the library does NOT.
 *   3. Reject an unverified email — the library does not check this either.
 *   4. Reject a missing `sub`, since identity is keyed on it.
 *   5. Normalise the email with the same rule the local DTOs use, and return the identity.
 *
 * The backend verifies Google's token itself and then issues its own session token. Google's
 * token is never used as a session credential.
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

import { normalizeEmail } from './auth.constants';
import { GoogleIdentity } from './interfaces/auth.types';

/**
 * Verifies a Google ID token and extracts the identity the app is willing to trust.
 *
 * This is the whole point of doing OAuth "the token-exchange way" rather than delegating to a
 * hosted auth service: the backend confirms Google's identity itself and then issues its own
 * session token. Google's token is verified and discarded — it is never used as a session
 * credential.
 *
 * verifyIdToken() checks three things for us: the RS256 signature against Google's rotating
 * public keys, that `aud` equals our client id, and that the token has not expired. It does NOT
 * check the issuer or whether the email is verified, so those are checked explicitly below —
 * skipping them is a well-known way to accept tokens minted for a different app or to trust an
 * unverified address.
 */
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  // Google mints the `iss` claim as one of these two spellings.
  private static readonly VALID_ISSUERS = [
    'accounts.google.com',
    'https://accounts.google.com',
  ];

  constructor(config: ConfigService) {
    // Held separately because it is needed twice: to build the client and as the audience.
    this.clientId = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client(this.clientId);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    // Step 1. Signature, audience and expiry are all handled in there.
    const payload = await this.verifySignatureAndAudience(idToken);

    // Step 2. Without this a token minted by a different issuer could be accepted.
    if (!payload.iss || !GoogleService.VALID_ISSUERS.includes(payload.iss)) {
      throw new UnauthorizedException('Google token has an unexpected issuer');
    }

    // A Google account can carry an email the user never proved they own; trusting an
    // unverified address is an account-takeover vector, so it is rejected.
    // Step 3. `!== true` rather than falsy — the claim can arrive as the string "true".
    if (!payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    // Step 4. `sub` is the stable identity key; an account cannot be linked without it.
    if (!payload.sub) {
      throw new UnauthorizedException('Google token is missing a subject');
    }

    // Normalised with the SAME rule the local DTOs use. Both the duplicate-email check in
    // AuthService and the row it may create read this value, so if Google returned "Asim@x.com"
    // while a LOCAL account exists as "asim@x.com", an unnormalised value would miss the check
    // and create a second account for one person.
    const email = normalizeEmail(payload.email) as string;

    // Step 5. Only these three claims are trusted; the rest of the token is discarded.
    return {
      providerId: payload.sub,
      email,
      // Google does not guarantee a name claim; fall back to the email so `name` is never null.
      name: payload.name ?? email,
    };
  }

  private async verifySignatureAndAudience(idToken: string) {
    try {
      // Checks the RS256 signature against Google's rotating keys, the audience, and expiry.
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();

      // Defensive: a verified ticket should always carry a payload.
      if (!payload) {
        throw new UnauthorizedException('Google token could not be read');
      }
      return payload;
    } catch (error) {
      // Rethrown untouched so the specific message above is not replaced by the generic one.
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Signature failure, wrong audience, or expiry all land here. The detail is logged but
      // not returned — the client only needs to know the token was rejected.
      this.logger.warn(
        `Google token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}
