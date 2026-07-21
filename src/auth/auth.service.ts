import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';

import { UserEntity } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResult } from './interfaces/auth.types';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Orchestrates the local auth flows. Holds no cryptography or persistence of its own — it
 * composes UsersService (rows), PasswordService (hashing) and TokenService (tokens). That
 * keeps each collaborator independently testable and this service readable as a sequence of
 * intent.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(dto.password);

    // Uniqueness of email is enforced by the DB constraint; a duplicate surfaces as P2002 and
    // is mapped to 409 by the global filter. No pre-check — it would be racy and redundant.
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      password: passwordHash,
      provider: AuthProvider.LOCAL,
    });

    const tokens = await this.tokens.issueForNewSession(user);
    return { user: new UserEntity(user), ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);

    // One generic failure for every reason (no such user, OAuth-only account with null
    // password, wrong password). Distinct messages would let an attacker enumerate which
    // emails are registered.
    //
    // The password is still verified against a decoy hash when the user does not exist, so the
    // response time does not reveal whether the email was found (timing side-channel).
    const hashToCheck = user?.password ?? this.passwords.getDummyHash();
    const passwordMatches = await this.passwords.verify(
      hashToCheck,
      dto.password,
    );

    if (!user || !user.password || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.tokens.issueForNewSession(user);
    return { user: new UserEntity(user), ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { user, ...tokens } = await this.tokens.rotate(refreshToken);
    return { user: new UserEntity(user), ...tokens };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeByToken(refreshToken);
  }
}
