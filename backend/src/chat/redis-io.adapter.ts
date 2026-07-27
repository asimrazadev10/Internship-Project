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
    const opts = {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    };
    const pub = new Redis(opts);
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
    this.corsOrigin = config.getOrThrow<string>('SOCKET_CORS_ORIGIN');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin },
    }) as {
      adapter: (a: unknown) => void;
    };
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
