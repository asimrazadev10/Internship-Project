import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageType } from '@prisma/client';

import { MessagesService } from './messages.service';
import { MESSAGE_CREATED } from './message-events';

function makeService() {
  const emit = jest.fn();
  const prisma = {
    message: {
      create: jest.fn().mockResolvedValue({
        id: 'm1',
        groupId: 'g1',
        content: 'summary text',
        type: MessageType.AI_SUMMARY,
        createdAt: new Date(),
        senderId: null,
        sender: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const service = new MessagesService(
    prisma as never,
    { emit } as unknown as EventEmitter2,
  );
  return { service, prisma, emit };
}

describe('MessagesService.createAiSummary', () => {
  it('persists an AI_SUMMARY with null sender and emits message.created', async () => {
    const { service, prisma, emit } = makeService();
    const msg = await service.createAiSummary('g1', 'summary text');

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { groupId: 'g1', senderId: null, content: 'summary text', type: MessageType.AI_SUMMARY },
      }),
    );
    expect(emit).toHaveBeenCalledWith(MESSAGE_CREATED, { message: msg });
    expect(msg.type).toBe(MessageType.AI_SUMMARY);
  });
});

describe('MessagesService.findForSummary', () => {
  it('queries only USER messages since the window start, oldest first', async () => {
    const { service, prisma } = makeService();
    const since = new Date('2026-07-22T00:00:00Z');
    await service.findForSummary('g1', since);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'g1', type: MessageType.USER, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });
});
