import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Without this, Nest does not listen for SIGTERM/SIGINT, so onModuleDestroy never fires
  // and the Prisma pool is torn down by process exit instead of being closed.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  await app.listen(port);

  Logger.log(
    `API listening on http://localhost:${port} [${config.get('NODE_ENV')}]`,
    'Bootstrap',
  );
}

void bootstrap();
