/**
 * HOW THIS FILE WORKS
 *   1. Call ConfigModule.forRoot once, here and nowhere else.
 *   2. Pass validateEnv, so a bad .env stops the process at boot.
 *
 * Imported by the main app and by all four worker modules.
 */
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
      // Injectable everywhere without re-importing.
      isGlobal: true,
      // Read once at startup rather than hitting process.env on every access.
      cache: true,
      // Step 2. Runs before any provider is constructed, so misconfiguration fails fast.
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
