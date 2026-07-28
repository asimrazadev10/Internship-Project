/**
 * HOW THIS FILE WORKS
 *   1. JwtPayload — the claims signed into an access token.
 *   2. AuthTokens — the access + refresh pair returned to the client.
 *   3. AuthResult — that pair plus the serialization-safe user.
 *   4. GoogleIdentity — the trusted claims extracted from a verified Google ID token.
 */
import { UserEntity } from '../../users/user.entity';

/**
 * Claims embedded in the access token (a JWT). `sub` is the user id, per JWT convention.
 * Deliberately small — the access token is an identity assertion, not a place to cache user
 * data that can go stale within the token's lifetime.
 */
export interface JwtPayload {
  // JwtStrategy.validate maps this to userId on request.user.
  sub: string;
  email: string;
}

/** The access + refresh pair returned to the client. */
export interface AuthTokens {
  // Short-lived JWT, verified on every request.
  accessToken: string;
  // Long-lived opaque random string, stored hashed and rotated on use.
  refreshToken: string;
}

/** The full auth result: the serialization-safe user plus the token pair. */
export interface AuthResult extends AuthTokens {
  // UserEntity, not the Prisma User — so the password hash cannot reach the wire.
  user: UserEntity;
}

/**
 * The verified identity extracted from a Google ID token. Only the claims the app trusts and
 * stores — never Google's token itself, which is discarded after verification.
 */
export interface GoogleIdentity {
  /** Google's stable subject id (the `sub` claim). Identity is keyed on this, not email. */
  providerId: string;
  email: string;
  name: string;
}
