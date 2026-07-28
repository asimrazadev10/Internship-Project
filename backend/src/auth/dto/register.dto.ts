/**
 * HOW THIS FILE WORKS
 *   1. Normalise the email, then validate its shape and length.
 *   2. Validate the password against the shared min/max bounds.
 *   3. Trim the display name, then validate its length.
 *
 * Runs in the global ValidationPipe before AuthService sees anything, so the service can assume
 * every field is already clean.
 */
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { Trim } from '../../common/decorators/trim.decorator';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
} from '../auth.constants';

export class RegisterDto {
  // Normalised before validation so the UNIQUE constraint on User.email actually means "one
  // account per address". Without it "Asim@x.com" and "asim@x.com" are two separate accounts, and
  // the person who registered as one gets "Invalid email or password" when they later type the
  // other — a dead end with no way to diagnose it from the UI.
  // Step 1. @Transform runs BEFORE the validators below.
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  // The message interpolates the bound rather than spelling it, so the number has exactly one
  // definition — writing "at least 8 characters" here would reintroduce the copy being removed.
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  // Step 2. The upper bound guards against a huge input being fed to argon2.
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  // Trimmed for the same reason group names are: "   " would otherwise satisfy @MinLength(1) and
  // create a user whose display name renders as blank everywhere.
  // Step 3. @Trim is a project decorator, applied before the length checks.
  @Trim()
  @IsString()
  @MinLength(NAME_MIN_LENGTH)
  @MaxLength(NAME_MAX_LENGTH)
  name: string;
}
