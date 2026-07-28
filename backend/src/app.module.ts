/**
 * HOW THIS FILE WORKS
 *   1. Import infrastructure: config, Prisma, the in-process event bus, the BullMQ connection.
 *   2. Import every feature module.
 *   3. Bind the global ValidationPipe as APP_PIPE.
 *   4. Bind the two response interceptors — ORDER MATTERS, see the note below.
 *   5. Bind the catch-all exception filter.
 *
 * Cross-cutting concerns are bound as providers rather than in main.ts, so they can inject.
 */
import {
  ClassSerializerInterceptor,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from './config/config.module';
import { bullConnectionFactory } from './config/redis.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { SummaryModule } from './summary/summary.module';
import { UsersModule } from './users/users.module';

/**
 * Cross-cutting concerns are bound here as providers rather than in main.ts via
 * app.useGlobalX(). The difference is dependency injection: a provider-bound interceptor can
 * inject Reflector, ConfigService or any other provider, while one constructed in main.ts
 * cannot. ResponseInterceptor needs Reflector, so this is the binding style that works.
 *
 * Interceptor ordering note: interceptors nest, so on the response path the LAST registered
 * runs FIRST. ClassSerializerInterceptor is therefore listed second — it strips @Exclude()
 * fields from the raw handler output before ResponseInterceptor wraps the result in the
 * envelope. Reversing these would serialize the envelope instead of the entity.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // The in-process bus behind MESSAGE_CREATED, MEMBER_JOINED and friends.
    EventEmitterModule.forRoot(),
    // The API is a queue PRODUCER only; the four workers are the consumers.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    // Step 2. AuthModule is what binds the global JwtAuthGuard, so importing it protects everything.
    HealthModule,
    SummaryModule,
    UsersModule,
    AuthModule,
    GroupsModule,
    MessagesModule,
    ChatModule,
  ],
  providers: [
    {
      // Step 3. useValue, not useClass — the pipe needs constructor options.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        // Strip properties with no matching DTO decorator, so unexpected fields cannot
        // reach a service and be written to the database by accident.
        whitelist: true,
        // Go further and reject the request outright, so a client sending a misspelled
        // field gets told rather than having it silently discarded.
        forbidNonWhitelisted: true,
        // Turn the plain request payload into an instance of the DTO class.
        transform: true,
        // enableImplicitConversion is deliberately NOT set. It coerces by inferred type and
        // produces surprises (e.g. "abc" -> NaN passing an @IsNumber check in some
        // versions). DTOs declare @Type(() => Number) explicitly instead.
      }),
    },
    // Step 4. Registered FIRST, so on the response path it runs LAST — wrapping the envelope
    // around output that ClassSerializerInterceptor has already stripped.
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // Registered second, so it runs first: @Exclude() fields go before anything is wrapped.
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    // Step 5. @Catch() with no argument, so this is the only filter needed.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
