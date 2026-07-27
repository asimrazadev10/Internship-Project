import { ConfigService } from '@nestjs/config';

/** One source of truth for the Redis connection, reused by the Bull root, the workers, and the
 *  notification emitter, so host/port/password are read identically everywhere. */
export const redisConnectionOptions = (config: ConfigService) => ({
  host: config.getOrThrow<string>('REDIS_HOST'),
  port: config.getOrThrow<number>('REDIS_PORT'),
  password: config.get<string>('REDIS_PASSWORD') || undefined,
});

/** BullModule.forRootAsync useFactory: the connection every queue/worker/flow shares. */
export const bullConnectionFactory = (config: ConfigService) => ({
  connection: redisConnectionOptions(config),
});
