import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

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

  // Access and refresh use SEPARATE secrets on purpose: a leaked access secret must not let an
  // attacker mint refresh tokens, and vice versa. Both are required — no default, because a
  // fallback secret in code is the same as no secret at all.
  @IsString()
  @IsNotEmpty({ message: 'JWT_ACCESS_SECRET is required' })
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET should be at least 32 characters',
  })
  JWT_ACCESS_SECRET!: string;

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
