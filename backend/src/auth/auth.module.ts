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
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
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
    AuthService,
    PasswordService,
    TokenService,
    GoogleService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
