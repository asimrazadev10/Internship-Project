/**
 * HOW THIS FILE WORKS
 *   1. Normalise the email exactly as RegisterDto does — this is the lookup side of that rule.
 *   2. Accept any password string up to the max length; no minimum is enforced here.
 */
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  normalizeEmail,
} from '../auth.constants';

export class LoginDto {
  // Normalised identically to RegisterDto — this is the lookup side of the same rule. If only one
  // of the two normalised, an account would exist that could never be signed into.
  //
  // Shares EMAIL_MAX_LENGTH with RegisterDto by construction: an address long enough to register
  // must be able to log in.
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  // No MinLength here on purpose: length rules belong at registration. Applying them at login
  // would leak which passwords could never exist, and a wrong password is a wrong password
  // regardless of its shape.
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
