/**
 * HOW THIS FILE WORKS
 *   1. redisConnectionOptions() reads REDIS_* from config into an ioredis options object.
 *   2. bullConnectionFactory() wraps that as the shape BullModule.forRootAsync expects.
 *
 * Two callers with different shapes, one source of truth — so the API, the four workers and the
 * Socket.IO emitter cannot end up pointing at different Redis servers.
 */
import { ConfigService } from '@nestjs/config';

/** One source of truth for the Redis connection, reused by the Bull root, the workers, and the
 *  notification emitter, so host/port/password are read identically everywhere. */
export const redisConnectionOptions = (config: ConfigService) => ({
  // Step 1. getOrThrow: a missing host must stop boot rather than default to localhost silently.
  host: config.getOrThrow<string>('REDIS_HOST'),
  port: config.getOrThrow<number>('REDIS_PORT'),
  // get, not getOrThrow — a local Redis has no password. `|| undefined` turns '' into "omitted",
  // because ioredis treats an empty-string password as an AUTH attempt and fails.
  password: config.get<string>('REDIS_PASSWORD') || undefined,
});

/** BullModule.forRootAsync useFactory: the connection every queue/worker/flow shares. */
export const bullConnectionFactory = (config: ConfigService) => ({
  // Step 2. BullMQ wants { connection }, ioredis wants the options directly — hence two functions.
  connection: redisConnectionOptions(config),
});
