import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { AI_RATE_LIMIT } from '../ai/ai.constants';
import { WORKER_CONCURRENCY } from '../queues/queue.constants';

/**
 * Startup configuration contract.
 *
 * The application must refuse to boot on a missing or malformed value rather than failing
 * later at the first request that happens to need it. A container that crashes immediately
 * on a bad config is trivially diagnosable; one that starts and then 500s under traffic is not.
 *
 * class-validator is used here rather than Joi so that configuration and HTTP request
 * payloads share one validation stack — one mental model, one set of decorators.
 *
 * Scope note: only what this build actually consumes is declared. JWT, Google OAuth, Redis
 * and Gemini variables are added to this class in the phase that introduces them. Requiring
 * GEMINI_API_KEY to boot a Phase 1 REST API would be a false constraint.
 */

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv, {
    message: `NODE_ENV must be one of: ${Object.values(NodeEnv).join(', ')}`,
  })
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // Environment variables arrive as strings; @Type converts before the numeric rules run.
  @Type(() => Number)
  @IsInt({ message: 'PORT must be an integer' })
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL is required' })
  DATABASE_URL!: string;

  // The signing secret for access tokens. Required with no default — a fallback secret in code is
  // the same as no secret at all.
  @IsString()
  @IsNotEmpty({ message: 'JWT_ACCESS_SECRET is required' })
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET should be at least 32 characters',
  })
  JWT_ACCESS_SECRET!: string;

  /**
   * RESERVED — currently unused by any code path. Listed in the assignment's env table, and kept
   * here so the documented configuration surface stays complete.
   *
   * It has no reader because refresh tokens in this implementation are NOT JWTs: TokenService
   * mints opaque `randomBytes` and stores only their SHA-256 hash, so there is nothing to sign and
   * therefore no secret to sign it with. (Signing was rejected because a stateless refresh JWT
   * cannot be revoked server-side, which rotation-with-reuse-detection requires.)
   *
   * If refresh tokens ever become signed JWTs, this is the secret to use — and the separation from
   * JWT_ACCESS_SECRET would then matter, so that a leaked access secret cannot mint refresh
   * tokens. Until then it is validated but never read.
   */
  @IsString()
  @IsNotEmpty({ message: 'JWT_REFRESH_SECRET is required' })
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET should be at least 32 characters',
  })
  JWT_REFRESH_SECRET!: string;

  // Duration strings (e.g. "15m", "7d"). Short access token, long refresh token.
  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  // The OAuth client id issued by Google Cloud. It is the `audience` a Google ID token must
  // carry, so token verification cannot work without it. Required at startup because Google
  // sign-in is part of this build — the same phase-scoped rule the JWT and database settings
  // follow. Only the client id is needed: the token-exchange flow verifies a token the client
  // already holds, so there is no client secret and no authorization-code exchange.
  @IsString()
  @IsNotEmpty({ message: 'GOOGLE_CLIENT_ID is required' })
  GOOGLE_CLIENT_ID!: string;

  // Redis — Socket.IO adapter (Phase 3) and BullMQ (Phase 4).
  @IsString()
  @IsNotEmpty({ message: 'REDIS_HOST is required' })
  REDIS_HOST: string = 'localhost';

  @Type(() => Number)
  @IsInt({ message: 'REDIS_PORT must be an integer' })
  @Min(1)
  @Max(65535)
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  // Origin allowed to open a WebSocket to the gateway. The socket connects directly to the
  // backend (WebSockets don't traverse the Next proxy), so the gateway needs CORS here.
  @IsString()
  @IsNotEmpty({ message: 'SOCKET_CORS_ORIGIN is required' })
  SOCKET_CORS_ORIGIN: string = 'http://localhost:3001';

  // Phase 4 — AI daily summaries.
  // Free Google AI Studio key (Generative Language API via @ai-sdk/google, NOT paid Vertex).
  @IsString()
  @IsNotEmpty({ message: 'GOOGLE_GENERATIVE_AI_API_KEY is required' })
  GOOGLE_GENERATIVE_AI_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  GEMINI_MODEL: string = 'gemini-2.0-flash';

  // Global Gemini call rate, enforced by the ai-queue's Redis-coordinated BullMQ limiter. Defaults
  // are free AI-Studio-tier figures; a paid key should raise them without a code change. Read via
  // process.env inside the @Processor decorator (which evaluates before ConfigService exists), so
  // this validation is what guarantees the values are well-formed.
  @Type(() => Number)
  @IsInt({ message: 'AI_RATE_LIMIT_MAX must be an integer' })
  @Min(1)
  AI_RATE_LIMIT_MAX: number = AI_RATE_LIMIT.max.default;

  @Type(() => Number)
  @IsInt({ message: 'AI_RATE_LIMIT_DURATION_MS must be an integer' })
  @Min(1000)
  AI_RATE_LIMIT_DURATION_MS: number = AI_RATE_LIMIT.duration.default;

  // Scheduler tick + how far back each summary looks. Default 24h; set small (e.g. 60000) to demo.
  @Type(() => Number)
  @IsInt({ message: 'SUMMARY_INTERVAL_MS must be an integer' })
  @Min(1000)
  SUMMARY_INTERVAL_MS = 86_400_000;

  @Type(() => Number)
  @IsInt({ message: 'SUMMARY_WINDOW_MS must be an integer' })
  @Min(1000)
  SUMMARY_WINDOW_MS = 86_400_000;

  // Phase 5 — per-worker BullMQ concurrency. Each standalone worker process reads its own knob.
  // Read two ways: the @Processor decorator reads process.env directly (it evaluates before
  // ConfigModule loads .env), and this validation guarantees the same keys are well-formed
  // integers for anything reading them through ConfigService.
  //
  // The defaults come from WORKER_CONCURRENCY so the decorator and this schema cannot drift —
  // previously each number was written in both places with nothing keeping them in step.
  @Type(() => Number)
  @IsInt({ message: 'SCHEDULER_WORKER_CONCURRENCY must be an integer' })
  @Min(1)
  SCHEDULER_WORKER_CONCURRENCY: number = WORKER_CONCURRENCY.SCHEDULER.default;

  @Type(() => Number)
  @IsInt({ message: 'AI_WORKER_CONCURRENCY must be an integer' })
  @Min(1)
  AI_WORKER_CONCURRENCY: number = WORKER_CONCURRENCY.AI.default;

  @Type(() => Number)
  @IsInt({ message: 'SUMMARY_WORKER_CONCURRENCY must be an integer' })
  @Min(1)
  SUMMARY_WORKER_CONCURRENCY: number = WORKER_CONCURRENCY.SUMMARY.default;

  @Type(() => Number)
  @IsInt({ message: 'NOTIFICATION_WORKER_CONCURRENCY must be an integer' })
  @Min(1)
  NOTIFICATION_WORKER_CONCURRENCY: number =
    WORKER_CONCURRENCY.NOTIFICATION.default;

  // Bonus (file uploads) — Supabase Storage. URL and key are optional: without them the service
  // falls back to writing under uploads/ on local disk, so uploads work with no external setup.
  // Only these three are needed because the backend uses the Storage REST API directly (no SDK):
  // the project URL, a service-role key (server-side only — never shipped to the browser), and
  // the target bucket name.
  @IsString()
  @IsOptional()
  SUPABASE_URL?: string;

  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_KEY?: string;

  // Defaulted here rather than in StorageService, so the schema is the single place any default
  // is declared — the same rule PORT, REDIS_HOST and GEMINI_MODEL follow. Only consulted on the
  // Supabase path; the local-disk fallback ignores it.
  @IsString()
  SUPABASE_BUCKET: string = 'chat-uploads';
}

export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  // plainToInstance copies every key, so unrelated environment variables survive into
  // ConfigService. Only the declared properties are validated.
  const config = plainToInstance(EnvironmentVariables, raw);

  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
      )
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return config;
}
