import { IsString, MinLength } from 'class-validator';

/**
 * Carries the opaque refresh token for both /auth/refresh and /auth/logout. The token is a
 * random string (not a JWT), so there is nothing to validate about its structure beyond it
 * being a non-empty string.
 */
export class RefreshDto {
  @IsString()
  @MinLength(1, { message: 'refreshToken is required' })
  refreshToken: string;
}
