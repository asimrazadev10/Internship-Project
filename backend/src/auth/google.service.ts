import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

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
    this.clientId = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client(this.clientId);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    const payload = await this.verifySignatureAndAudience(idToken);

    if (!payload.iss || !GoogleService.VALID_ISSUERS.includes(payload.iss)) {
      throw new UnauthorizedException('Google token has an unexpected issuer');
    }

    // A Google account can carry an email the user never proved they own; trusting an
    // unverified address is an account-takeover vector, so it is rejected.
    if (!payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Google token is missing a subject');
    }

    return {
      providerId: payload.sub,
      email: payload.email,
      // Google does not guarantee a name claim; fall back to the email so `name` is never null.
      name: payload.name ?? payload.email,
    };
  }

  private async verifySignatureAndAudience(idToken: string) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Google token could not be read');
      }
      return payload;
    } catch (error) {
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
