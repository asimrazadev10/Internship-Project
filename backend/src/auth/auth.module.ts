/**
 * HOW THIS FILE WORKS
 *   1. Import UsersModule (user persistence) and PassportModule (strategy plumbing).
 *   2. Register JwtModule async, so the secret and expiry come from validated config.
 *   3. Declare the controller and the four auth services plus the JWT strategy.
 *   4. Bind JwtAuthGuard as APP_GUARD — this is what makes every route protected by default.
 *
 * Importing this module is what turns authentication on application-wide.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

/**
 * Wires the auth feature together.
 *
 * JwtModule is registered async so the access secret and expiry come from validated config,
 * never a literal. These defaults apply to every JwtService.sign call, which is why
 * TokenService does not repeat them.
 *
 * The JwtAuthGuard is bound with APP_GUARD here rather than in AppModule. Nest hoists APP_*
 * providers to global scope regardless of which module declares them, and keeping it beside the
 * strategy it depends on makes the auth module self-contained: importing it turns protection on.
 */
@Module({
  imports: [
    // Step 1. Auth reaches users through UsersService, never through the table directly.
    UsersModule,
    PassportModule,
    // Step 2. registerAsync so the secret is read from config rather than written as a literal.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Applied to every sign() call, which is why TokenService does not repeat them.
        signOptions: {
          // Cast: `ms` types expiresIn as a template-literal StringValue, which will not accept
          // an arbitrary string. The value is a validated config string ("15m"), so the cast is
          // safe and confined to this one line.
          expiresIn: config.getOrThrow<string>(
            'JWT_ACCESS_EXPIRES_IN',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Step 3. AuthService orchestrates; the other three each own one concern.
    AuthService,
    PasswordService,
    TokenService,
    GoogleService,
    JwtStrategy,
    // Step 4. APP_GUARD is global regardless of the declaring module — deny by default, with
    // @Public() as the opt-out. The safer direction: forgetting the decorator locks a route down
    // rather than exposing it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
