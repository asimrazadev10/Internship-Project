/**
 * HOW THIS FILE WORKS
 *   1. Create the Nest app from AppModule — with an HTTP server, unlike the four workers.
 *   2. Serve locally-stored uploads as static files, with two hardening headers.
 *   3. Enable shutdown hooks so Prisma and Redis close cleanly on SIGTERM.
 *   4. Install the Redis-backed Socket.IO adapter.
 *   5. Listen on the validated PORT and log the readiness line.
 *
 * The API process's entry point. Compare src/workers/*.worker.ts, which use
 * createApplicationContext and never listen on a port.
 */
import { ServerResponse } from 'node:http';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { RedisIoAdapter } from './chat/redis-io.adapter';
import { StorageService } from './storage/storage.service';

async function bootstrap(): Promise<void> {
  // Step 1. The NestExpressApplication generic is what makes useStaticAssets available below.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve locally-stored uploads (the dev fallback when Supabase isn't configured) as public
  // static files at /uploads. The browser reaches these via the Next /api proxy. Registered as
  // Express middleware, so it bypasses the global JWT guard — these are public URLs by design,
  // exactly like a Supabase public bucket.
  //
  // Unlike a Supabase bucket, though, these are served from the APP'S OWN ORIGIN, so a file that
  // the browser decides to render as a document runs script with access to localStorage — where
  // the access token lives. StorageService already removes the primary route to that by deriving
  // the stored extension from the validated MIME. These two headers are the second layer:
  //   nosniff — never content-sniff a response into a type its Content-Type did not declare
  //   sandbox — give any document served from here an opaque origin, so even if one were somehow
  //             rendered it could not reach this origin's storage, cookies or DOM
  // Neither affects <img src> or a PDF download; a response CSP only constrains the document a
  // URL becomes when navigated to directly, which is exactly the case being closed.
  app.useStaticAssets(StorageService.uploadsDir(), {
    prefix: '/uploads/',
    setHeaders: (res: ServerResponse) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  });

  // Without this, Nest does not listen for SIGTERM/SIGINT, so onModuleDestroy never fires
  // and the Prisma pool is torn down by process exit instead of being closed.
  app.enableShutdownHooks();

  // Pulled from the container, because the adapter below needs it before listen().
  const config = app.get(ConfigService);

  // Redis-backed Socket.IO adapter: `server.to(room).emit` fans out across gateway instances
  // via Redis pub/sub. Wired even single-node so scaling out later needs no code change.
  // Step 4. Also the mechanism by which the notification worker's emits reach these clients.
  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connectToRedis(config);
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

// `void` marks the floating promise as deliberate for eslint.
void bootstrap();
