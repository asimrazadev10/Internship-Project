import { IsEmail, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../auth.constants';

export class LoginDto {
  // Shares EMAIL_MAX_LENGTH with RegisterDto by construction: an address long enough to register
  // must be able to log in.
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
