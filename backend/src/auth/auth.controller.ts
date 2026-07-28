/**
 * HOW THIS FILE WORKS
 *   1. POST /auth/register — create an account, return user + tokens.
 *   2. POST /auth/login — verify a password, return user + tokens.
 *   3. POST /auth/refresh — exchange a refresh token for a new pair.
 *   4. POST /auth/google — exchange a verified Google ID token for a pair.
 *   5. POST /auth/logout — revoke the whole rotation family. The ONLY guarded route here.
 *
 * Maps HTTP to AuthService and nothing else; its only decisions are @Public() and status codes.
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResult } from './interfaces/auth.types';

/**
 * Thin controller: it maps HTTP to AuthService calls and nothing else. No business logic, no
 * cryptography — those live in the services. Its only real decisions are which routes are
 * @Public() and what status codes they return.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Step 1. @Public() — you cannot hold a token before you have an account.
  @Public()
  @Post('register')
  // 201 is left as the default here: registration really does create a resource.
  @ResponseMessage('Registration successful')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  // Default POST status is 201 Created; login creates no resource, so it is 200.
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login successful')
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  // Step 3. Public because the access token has usually expired by the time this is called.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Token refreshed')
  refresh(@Body() dto: RefreshDto): Promise<AuthResult> {
    return this.authService.refresh(dto.refreshToken);
  }

  // Step 4. The Google ID token is the credential, so no app token exists yet.
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login successful')
  google(@Body() dto: GoogleLoginDto): Promise<AuthResult> {
    return this.authService.googleLogin(dto.idToken);
  }

  /**
   * Logout is NOT @Public(): a caller must hold a valid access token to end a session, which
   * the global JwtAuthGuard enforces. The refresh token in the body identifies which family to
   * revoke — logout revokes the whole rotation family, not just one token.
   */
  // Step 5. No @Public(), so the global guard applies — the one guarded route in this controller.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logged out')
  async logout(@Body() dto: RefreshDto): Promise<{ success: boolean }> {
    await this.authService.logout(dto.refreshToken);
    // A fixed shape rather than the revoked count — the client has no use for the number.
    return { success: true };
  }
}
