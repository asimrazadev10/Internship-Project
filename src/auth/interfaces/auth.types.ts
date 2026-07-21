import { UserEntity } from '../../users/user.entity';

/**
 * Claims embedded in the access token (a JWT). `sub` is the user id, per JWT convention.
 * Deliberately small — the access token is an identity assertion, not a place to cache user
 * data that can go stale within the token's lifetime.
 */
export interface JwtPayload {
  sub: string;
  email: string;
}

/** The access + refresh pair returned to the client. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** The full auth result: the serialization-safe user plus the token pair. */
export interface AuthResult extends AuthTokens {
  user: UserEntity;
}
