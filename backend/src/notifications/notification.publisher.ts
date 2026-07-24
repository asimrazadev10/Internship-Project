import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';

import { roomFor } from '../chat/chat.constants';
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
  private redis!: Redis;
  private emitter!: Emitter;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis(redisConnectionOptions(this.config));
    this.emitter = new Emitter(this.redis);
    this.logger.log('redis emitter ready');
  }

  broadcastNewMessage(message: BroadcastMessage): void {
    this.emitter.to(roomFor(message.groupId)).emit('new_message', message);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
