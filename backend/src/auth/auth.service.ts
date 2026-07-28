/**
 * HOW THIS FILE WORKS
 *   1. register() — hash the password, insert the user, issue a token pair.
 *   2. login() — look the user up, verify against a real or decoy hash, issue a pair.
 *   3. refresh() — delegate to TokenService.rotate.
 *   4. googleLogin() — verify the ID token, resolve or create the user, issue a pair.
 *   5. resolveGoogleUser() — match on provider subject id, refuse to auto-link by email.
 *   6. logout() — revoke the whole rotation family.
 *
 * Holds no cryptography or persistence of its own; it composes UsersService, PasswordService,
 * TokenService and GoogleService.
 */
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider, User } from '@prisma/client';

import { UserEntity } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { GoogleService } from './google.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResult, GoogleIdentity } from './interfaces/auth.types';
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
    private readonly google: GoogleService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    // Step 1. Hash before the insert, so the plaintext never reaches the persistence layer.
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
    // Wrapped in UserEntity so @Exclude() strips the hash on the way out.
    return { user: new UserEntity(user), ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    // Step 2. Email was already normalised by the DTO, so this lookup matches registration.
    const user = await this.users.findByEmail(dto.email);

    // One generic failure for every reason (no such user, OAuth-only account with null
    // password, wrong password). Distinct messages would let an attacker enumerate which
    // emails are registered.
    //
    // The password is still verified against a decoy hash when the user does not exist, so the
    // response time does not reveal whether the email was found (timing side-channel).
    const hashToCheck = user?.password ?? this.passwords.getDummyHash();
    // Always awaited, even in the not-found case — that is the whole point of the decoy.
    const passwordMatches = await this.passwords.verify(
      hashToCheck,
      dto.password,
    );

    // Three distinct causes, one indistinguishable response.
    if (!user || !user.password || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.tokens.issueForNewSession(user);
    return { user: new UserEntity(user), ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    // Step 3. rotate() returns the user alongside the new pair, so no extra lookup is needed.
    const { user, ...tokens } = await this.tokens.rotate(refreshToken);
    return { user: new UserEntity(user), ...tokens };
  }

  /**
   * Google sign-in. Verify the ID token ourselves, then map the Google identity to a local
   * user and issue our own session tokens — Google's token never becomes a session credential.
   */
  async googleLogin(idToken: string): Promise<AuthResult> {
    // Step 4. Verification happens first; nothing below runs on an untrusted token.
    const identity = await this.google.verify(idToken);
    const user = await this.resolveGoogleUser(identity);

    // From here the flow is identical to a password login — same tokens, same lifetimes.
    const tokens = await this.tokens.issueForNewSession(user);
    return { user: new UserEntity(user), ...tokens };
  }

  private async resolveGoogleUser(identity: GoogleIdentity): Promise<User> {
    // A returning Google user is recognised by the provider subject id, not by email — the sub
    // is stable while an email can change.
    const existing = await this.users.findByProviderId(
      AuthProvider.GOOGLE,
      identity.providerId,
    );
    if (existing) {
      return existing;
    }

    // First time this Google account is seen. If the email already belongs to another account
    // (a LOCAL password account, typically), do NOT silently attach Google to it: automatic
    // linking by email is an account-takeover path, and this schema models one provider per
    // user. Refuse with a clear message instead. (The email unique constraint is the real
    // backstop; this check exists to return a helpful error rather than a generic 409.)
    const emailOwner = await this.users.findByEmail(identity.email);
    if (emailOwner) {
      throw new ConflictException(
        'An account with this email already exists. Sign in with your password.',
      );
    }

    // Step 5. A brand-new Google account: create it with providerId as the identity key.
    return this.users.create({
      email: identity.email,
      name: identity.name,
      provider: AuthProvider.GOOGLE,
      providerId: identity.providerId,
      // No password: an OAuth-only account has nothing to verify locally.
    });
  }

  async logout(refreshToken: string): Promise<void> {
    // Step 6. Revokes the family, not just this token, so every rotation descendant dies too.
    await this.tokens.revokeByToken(refreshToken);
  }
}
