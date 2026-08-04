/**
 * HOW THIS FILE WORKS
 *   1. EnvironmentVariables declares every setting as a decorated property.
 *   2. A property with an initialiser has a default; one with `!` is required.
 *   3. @Type(() => Number) converts before numeric rules run — env vars arrive as strings.
 *   4. validateEnv() builds an instance from process.env and validates it synchronously.
 *   5. Any error throws, so a misconfigured process dies at boot rather than at first request.
 *
 * Grouped by concern in the order the phases introduced them: runtime, database, JWT, Google,
 * Redis, sockets, AI, schedules, worker concurrency, storage.
 */
import { plainToInstance, Type } from 'class-transformer';
import {
  IsBoolean,
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
import { REFRESH_TOKEN_PURGE_GRACE_MS as PURGE_GRACE_DEFAULT } from '../auth/auth.constants';
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
  // ---- Runtime ----
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

  // Feature flag — whether the four BullMQ worker processes should be launched by the dev runner.
  // Defaults to true. Parsed manually in convert() (NOT via @Type) because class-transformer maps
  // ANY non-empty string to true — the classic Boolean()("false") === true trap — so a literal
  // "false" here must stay false.
  @IsBoolean({ message: 'IS_WORKER_ENABLED must be "true" or "false"' })
  IS_WORKER_ENABLED: boolean = true;

  // ---- Per-service feature flags ----
  // A master switch is not enough to run a reduced stack (e.g. "no AI worker but keep the other
  // three"). Each SERVICE_*_ENABLED flag turns that one worker on/off; IS_WORKER_ENABLED above is
  // still the master — master off wins over every per-worker flag. Consumed by the dev runner
  // (dev.ps1) but validated here so a typo fails at boot rather than silently skipping a worker.
  @IsBoolean({ message: 'SERVICE_SCHEDULER_ENABLED must be "true" or "false"' })
  SERVICE_SCHEDULER_ENABLED: boolean = true;

  @IsBoolean({ message: 'SERVICE_AI_ENABLED must be "true" or "false"' })
  SERVICE_AI_ENABLED: boolean = true;

  @IsBoolean({ message: 'SERVICE_SUMMARY_ENABLED must be "true" or "false"' })
  SERVICE_SUMMARY_ENABLED: boolean = true;

  @IsBoolean({
    message: 'SERVICE_NOTIFICATION_ENABLED must be "true" or "false"',
  })
  SERVICE_NOTIFICATION_ENABLED: boolean = true;

  // ---- Per-feature flags for the single API process ----
  // The four flags above toggle the WORKER processes (consumed by dev.ps1). The API itself is ONE
  // process that serves every feature's HTTP routes in the same app, so to stop one feature you
  // cannot drop a process — you must make its routes 404. Each of these gates one feature's routes
  // (see FeatureGateGuard). isMaster still covers workers only; these are read by the API runtime.
  @IsBoolean({ message: 'SERVICE_AUTH_ENABLED must be "true" or "false"' })
  SERVICE_AUTH_ENABLED: boolean = true;

  @IsBoolean({ message: 'SERVICE_GROUPS_ENABLED must be "true" or "false"' })
  SERVICE_GROUPS_ENABLED: boolean = true;

  @IsBoolean({
    message: 'SERVICE_MESSAGES_ENABLED must be "true" or "false"',
  })
  SERVICE_MESSAGES_ENABLED: boolean = true;

  // The HTTP manual-trigger route (/summaries). Distinct from SERVICE_SUMMARY_ENABLED above, which
  // is the summary WORKER process. Two flags, two processes/route-groups, deliberate.
  @IsBoolean({
    message: 'SERVICE_SUMMARIES_ENABLED must be "true" or "false"',
  })
  SERVICE_SUMMARIES_ENABLED: boolean = true;

  @IsBoolean({ message: 'SERVICE_HEALTH_ENABLED must be "true" or "false"' })
  SERVICE_HEALTH_ENABLED: boolean = true;

  // The Socket.IO gateway. Guards never run on a WebSocket, so the gateway reads this itself.
  @IsBoolean({ message: 'SERVICE_CHAT_ENABLED must be "true" or "false"' })
  SERVICE_CHAT_ENABLED: boolean = true;

  // The Bull Board dashboard (/admin/queues). Mounted as its own Express middleware, so the
  // dashboard (not a route-specific guard) reads this itself.
  @IsBoolean({
    message: 'SERVICE_QUEUE_BOARD_ENABLED must be "true" or "false"',
  })
  SERVICE_QUEUE_BOARD_ENABLED: boolean = true;

  // ---- Database ----
  // MongoDB connection string. No default — must be provided via MONGODB_URI.
  @IsString()
  @IsNotEmpty({ message: 'MONGODB_URI is required' })
  MONGODB_URI!: string;

  // ---- JWT ----

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

  // ---- Redis ----
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

  // ---- AI summaries ----
  // Phase 4 — AI daily summaries.
  // Free Google AI Studio key (Generative Language API via @ai-sdk/google, NOT paid Vertex).
  @IsString()
  @IsNotEmpty({ message: 'GOOGLE_GENERATIVE_AI_API_KEY is required' })
  GOOGLE_GENERATIVE_AI_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  // gemini-3.5-flash, not the 2.x line: a newly created Google project gets ZERO free-tier quota
  // for gemini-2.0-flash (429 with `limit: 0` — not quota exhausted, none ever allocated), and
  // gemini-2.5-flash returns 404 "no longer available to new users". Both fail only at the first
  // real summary job, long after the key itself validates, so the default has to be a model a
  // fresh key can actually call.
  GEMINI_MODEL: string = 'gemini-3.5-flash';

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

  // ---- Schedules ----
  // Scheduler tick + how far back each summary looks. Default 24h; set small (e.g. 60000) to demo.
  @Type(() => Number)
  @IsInt({ message: 'SUMMARY_INTERVAL_MS must be an integer' })
  @Min(1000)
  SUMMARY_INTERVAL_MS = 86_400_000;

  @Type(() => Number)
  @IsInt({ message: 'SUMMARY_WINDOW_MS must be an integer' })
  @Min(1000)
  SUMMARY_WINDOW_MS = 86_400_000;

  // How often the refresh-token purge runs. Its OWN knob rather than reusing SUMMARY_INTERVAL_MS,
  // which is documented as "set small (e.g. 60000) to demo" — a demo tick must not drag token
  // deletion along with it every minute.
  @Type(() => Number)
  @IsInt({ message: 'TOKEN_PURGE_INTERVAL_MS must be an integer' })
  @Min(1000)
  TOKEN_PURGE_INTERVAL_MS = 86_400_000;

  // How long an EXPIRED refresh token is kept before the purge deletes it. The default and the
  // reasoning behind an expiry-only predicate live on the constant.
  @Type(() => Number)
  @IsInt({ message: 'REFRESH_TOKEN_PURGE_GRACE_MS must be an integer' })
  @Min(0)
  REFRESH_TOKEN_PURGE_GRACE_MS: number = PURGE_GRACE_DEFAULT;

  // ---- Worker concurrency ----
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

  // ---- Bull Board (queue dashboard) ----
  // HTTP basic-auth user for the /admin/queues dashboard. Always required; the module uses it
  // for the credentials object even when the password is unset (empty object = locked).
  @IsString()
  @IsNotEmpty({ message: 'BOARDS_USER is required' })
  BOARDS_USER: string = 'admin';

  // Optional password. Absent/unset keeps the board locked (no users configured), so a fresh
  // clone cannot ship with a well-known secret already unlocking the queue dashboard.
  @IsString()
  @IsOptional()
  BOARDS_PASSWORD?: string;

  // ---- Storage ----
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

/**
 * Parse a boolean env var strictly — only the literals "true"/"false" survive. Anything else
 * (including "1", "yes" or a missing value) is an error, so a typo cannot silently flip a flag.
 */
function parseBoolean(key: string, value: unknown): boolean {
  switch (value) {
    case undefined:
    case '':
      // Use the class default (true) rather than erroring — matches how PORT/SUMMARY_* default.
      return true;
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new Error(
        `Invalid value for ${key}: "${String(value)}" — expected "true" or "false".`,
      );
  }
}

const BOOLEAN_KEYS = [
  'IS_WORKER_ENABLED',
  'SERVICE_SCHEDULER_ENABLED',
  'SERVICE_AI_ENABLED',
  'SERVICE_SUMMARY_ENABLED',
  'SERVICE_NOTIFICATION_ENABLED',
  'SERVICE_AUTH_ENABLED',
  'SERVICE_GROUPS_ENABLED',
  'SERVICE_MESSAGES_ENABLED',
  'SERVICE_SUMMARIES_ENABLED',
  'SERVICE_HEALTH_ENABLED',
  'SERVICE_CHAT_ENABLED',
  'SERVICE_QUEUE_BOARD_ENABLED',
] as const;

export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  // plainToInstance copies every key, so unrelated environment variables survive into
  // ConfigService. Only the declared properties are validated.
  const config = plainToInstance(EnvironmentVariables, {
    ...raw,
    // @Type(() => Boolean) would turn "false" into true; do it by hand instead so every flag is
    // both correctly typed and truthfully valued.
    ...Object.fromEntries(
      BOOLEAN_KEYS.map((k) => [k, parseBoolean(k, raw[k])]),
    ),
  });

  // Step 4. Synchronous, because ConfigModule.forRoot's `validate` hook cannot await.
  // skipMissingProperties: false is what makes an absent required variable an error.
  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
      )
      .join('\n');

    // Step 5. Every failure at once, not just the first — so one restart fixes the whole .env.
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return config;
}
