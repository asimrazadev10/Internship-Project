import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../auth.constants';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;

  // The message interpolates the bound rather than spelling it, so the number has exactly one
  // definition — writing "at least 8 characters" here would reintroduce the copy being removed.
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @IsString()
  @MinLength(NAME_MIN_LENGTH)
  @MaxLength(NAME_MAX_LENGTH)
  name: string;
}
