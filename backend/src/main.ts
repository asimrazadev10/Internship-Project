import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { RedisIoAdapter } from './chat/redis-io.adapter';
import { StorageService } from './storage/storage.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve locally-stored uploads (the dev fallback when Supabase isn't configured) as public
  // static files at /uploads. The browser reaches these via the Next /api proxy. Registered as
  // Express middleware, so it bypasses the global JWT guard — these are public URLs by design,
  // exactly like a Supabase public bucket.
  app.useStaticAssets(StorageService.uploadsDir(), { prefix: '/uploads/' });

  // Without this, Nest does not listen for SIGTERM/SIGINT, so onModuleDestroy never fires
  // and the Prisma pool is torn down by process exit instead of being closed.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);

  // Redis-backed Socket.IO adapter: `server.to(room).emit` fans out across gateway instances
  // via Redis pub/sub. Wired even single-node so scaling out later needs no code change.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(config);
  app.useWebSocketAdapter(redisIoAdapter);

  // getOrThrow, not get(key, fallback): the validated schema always carries PORT (it declares its
  // own default), so a fallback here is unreachable code that would silently disagree with the
  // schema the day someone changes that default.
  const port = config.getOrThrow<number>('PORT');

  await app.listen(port);

  Logger.log(
    `API listening on http://localhost:${port} [${config.get('NODE_ENV')}]`,
    'Bootstrap',
  );
}

void bootstrap();
