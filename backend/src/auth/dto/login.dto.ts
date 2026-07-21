import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(254)
  email: string;

  // No MinLength here on purpose: length rules belong at registration. Applying them at login
  // would leak which passwords could never exist, and a wrong password is a wrong password
  // regardless of its shape.
  @IsString()
  @MaxLength(128)
  password: string;
}
