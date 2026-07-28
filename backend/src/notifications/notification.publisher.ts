/**
 * HOW THIS FILE WORKS
 *   1. onModuleInit opens its own ioredis client and wraps it in a Socket.IO Emitter.
 *   2. broadcastNewMessage() emits to the group's room on that emitter.
 *   3. onModuleDestroy quits the client on shutdown.
 *
 * The trick that lets a worker with NO Socket.IO server reach connected browsers: it publishes to
 * the same Redis channels the API's redis-adapter already subscribes to.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';

import { SERVER_EVENTS, roomFor } from '../chat/chat.constants';
import { redisConnectionOptions } from '../config/redis.config';
import type { BroadcastMessage } from '../messages/message-events';

/**
 * Broadcasts from a worker process that has NO Socket.IO server of its own. The emitter publishes
 * to the same Redis channels the main app's @socket.io/redis-adapter subscribes to (same default
 * key `socket.io`, same `/` namespace, same `group:<id>` room and `new_message` event), so a
 * client connected to the API process receives an AI summary identically to a live user message.
 */
@Injectable()
export class NotificationPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationPublisher.name);
  // `!` because both are assigned in onModuleInit, not in the constructor.
  private redis!: Redis;
  private emitter!: Emitter;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Step 1. A dedicated client — this publishes on Socket.IO's channels, not BullMQ's.
    this.redis = new Redis(redisConnectionOptions(this.config));
    // Default key 'socket.io' and namespace '/', which is what makes the API's adapter pick it up.
    this.emitter = new Emitter(this.redis);
    this.logger.log('redis emitter ready');
  }

  broadcastNewMessage(message: BroadcastMessage): void {
    // Step 2. roomFor and SERVER_EVENTS are shared with the gateway, so the room name and event
    // name cannot drift between the emitting process and the receiving one.
    this.emitter
      .to(roomFor(message.groupId))
      .emit(SERVER_EVENTS.NEW_MESSAGE, message);
  }

  async onModuleDestroy(): Promise<void> {
    // Step 3. quit() over disconnect() so buffered publishes flush before the socket closes.
    await this.redis?.quit();
  }
}
