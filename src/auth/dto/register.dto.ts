import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254) // RFC 5321 maximum length of an email address
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  // argon2 has no 72-byte truncation issue (unlike bcrypt), but an upper bound still guards
  // against a multi-megabyte body being fed into the hash function as a cheap DoS.
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}
