import { ClassSerializerInterceptor, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { AppConfigModule } from './config/config.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaModule } from './prisma/prisma.module';

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
  imports: [AppConfigModule, PrismaModule],
  providers: [
    {
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
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
