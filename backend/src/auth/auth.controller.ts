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

  @Public()
  @Post('register')
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

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Token refreshed')
  refresh(@Body() dto: RefreshDto): Promise<AuthResult> {
    return this.authService.refresh(dto.refreshToken);
  }

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
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logged out')
  async logout(@Body() dto: RefreshDto): Promise<{ success: boolean }> {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }
}
