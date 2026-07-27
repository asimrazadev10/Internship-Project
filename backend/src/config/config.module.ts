import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './env.validation';

/**
 * Wraps @nestjs/config so the validation contract lives in one place and the rest of the
 * application never imports ConfigModule.forRoot directly.
 *
 * isGlobal: ConfigService is injectable everywhere without re-importing this module.
 * cache:    environment lookups are read once at startup instead of hitting process.env
 *           on every access.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
