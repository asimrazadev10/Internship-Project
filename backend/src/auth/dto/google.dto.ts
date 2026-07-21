import { IsString, MinLength } from 'class-validator';

/**
 * Carries the Google ID token the frontend obtained from Google's sign-in. It is a JWT, but the
 * backend does not parse it here — GoogleService verifies its signature and claims — so the DTO
 * only asserts a non-empty string was sent.
 */
export class GoogleLoginDto {
  @IsString()
  @MinLength(1, { message: 'idToken is required' })
  idToken: string;
}
