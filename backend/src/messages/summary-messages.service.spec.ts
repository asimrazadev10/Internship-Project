import { MessageType } from '@prisma/client';

import { SummaryMessagesService } from './summary-messages.service';

function makeService() {
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
  const service = new SummaryMessagesService(prisma as never);
  return { service, prisma };
}

describe('SummaryMessagesService.persistAiSummary', () => {
  it('persists an AI_SUMMARY with a null sender', async () => {
    const { service, prisma } = makeService();
    const msg = await service.persistAiSummary('g1', 'summary text');

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          groupId: 'g1',
          senderId: null,
          content: 'summary text',
          type: MessageType.AI_SUMMARY,
        },
      }),
    );
    expect(msg.type).toBe(MessageType.AI_SUMMARY);
  });

  /**
   * The old version of this test asserted `emit` was never called, which it could only do because
   * the service took an EventEmitter2. After the split it takes PrismaService alone, so "does not
   * broadcast" is now guaranteed by the constructor signature rather than by an assertion — a
   * stronger guarantee than the test it replaces. Worth being able to say that out loud.
   */
  it('has no way to emit: the service depends on Prisma only', () => {
    expect(SummaryMessagesService.length).toBe(1);
  });
});

describe('SummaryMessagesService.findForSummary', () => {
  it('queries only USER messages since the window start, oldest first', async () => {
    const { service, prisma } = makeService();
    const since = new Date('2026-07-22T00:00:00Z');
    await service.findForSummary('g1', since);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'g1',
          type: MessageType.USER,
          createdAt: { gte: since },
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });
});

describe('SummaryMessagesService.hasSummarySince', () => {
  it('is false when no AI_SUMMARY exists in the window', async () => {
    const { service } = makeService();
    await expect(service.hasSummarySince('g1', new Date())).resolves.toBe(false);
  });
});
