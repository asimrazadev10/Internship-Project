import { MessageType } from '@prisma/client';

import { NotificationPublisher } from './notification.publisher';
import { roomFor } from '../chat/chat.constants';
import type { BroadcastMessage } from '../messages/message-events';

describe('NotificationPublisher', () => {
  it('emits new_message to the group room via the emitter', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    // Bypass onModuleInit so no real Redis client is created.
    const publisher = new NotificationPublisher({} as never);
    (publisher as unknown as { emitter: { to: typeof to } }).emitter = { to };

    const message: BroadcastMessage = {
      id: 'm1',
      groupId: 'g1',
      content: 'digest',
      type: MessageType.AI_SUMMARY,
      createdAt: new Date(),
      senderId: null,
      sender: null,
    };
    publisher.broadcastNewMessage(message);

    expect(to).toHaveBeenCalledWith(roomFor('g1'));
    expect(emit).toHaveBeenCalledWith('new_message', message);
  });
});
