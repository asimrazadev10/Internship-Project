/**
 * HOW THIS FILE WORKS
 *   1. Assert refreshToken is a non-empty string. Nothing more — it is opaque, not a JWT.
 *
 * Used by both POST /auth/refresh and POST /auth/logout.
 */
import { IsString, MinLength } from 'class-validator';

/**
 * Carries the opaque refresh token for both /auth/refresh and /auth/logout. The token is a
 * random string (not a JWT), so there is nothing to validate about its structure beyond it
 * being a non-empty string.
 */
export class RefreshDto {
  @IsString()
  // A structural check would be meaningless: TokenService hashes and looks the value up.
  @MinLength(1, { message: 'refreshToken is required' })
  refreshToken: string;
}
