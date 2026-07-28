/**
 * HOW THIS FILE WORKS
 *   1. connectToRedis() builds a pub client and a duplicated sub client, and stores the adapter.
 *   2. It also captures the CORS origin, which cannot come from DI at server-creation time.
 *   3. createIOServer() applies the CORS option and attaches the adapter to the new server.
 *
 * With the adapter installed, server.to(room).emit fans out across every API instance via Redis
 * pub/sub — and it is the same channel the notification worker publishes onto.
 */
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';

/**
 * Socket.IO server backed by the Redis adapter. With it, `server.to(room).emit` fans out across
 * every gateway instance via Redis pub/sub, so a user connected to node B receives a message
 * published on node A. Wired even single-node so scaling out needs no code change.
 */
export class RedisIoAdapter extends IoAdapter {
  // Optional because createIOServer can run before connectToRedis in a test.
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private corsOrigin?: string;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /**
   * Synchronous despite the name: ioredis connects LAZILY, so `new Redis(opts)` returns
   * immediately and the handshake happens on first use. There is nothing to await here, and
   * marking it `async` implied a connection had been established by the time it resolved — which
   * was never true. Failures surface on the socket, not from this call.
   */
  connectToRedis(config: ConfigService): void {
    // Built inline rather than via redisConnectionOptions: this runs in main.ts before the DI
    // graph is available in the usual way.
    const opts = {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    };
    // Step 1. Two connections are mandatory — a Redis client in subscribe mode cannot publish.
    const pub = new Redis(opts);
    // duplicate() copies the options, so the pair cannot drift apart.
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
    // Step 2. Sockets bypass the Next.js /api proxy, so this origin is the real CORS boundary.
    this.corsOrigin = config.getOrThrow<string>('SOCKET_CORS_ORIGIN');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    // Step 3. Let the base class build the server, then layer CORS on top of its options.
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin },
    }) as {
      adapter: (a: unknown) => void;
    };
    // Guarded so the server still works if connectToRedis was never called.
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
