import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { REACTION_CHANGED } from './message-events';
import { ReactionsService } from './reactions.service';

function makePrisma(overrides: {
  deleteCount?: number;
  createImpl?: () => Promise<unknown>;
}) {
  const create = jest
    .fn()
    .mockImplementation(overrides.createImpl ?? (() => Promise.resolve({})));
  return {
    prisma: {
      message: { findFirst: jest.fn().mockResolvedValue({ id: 'm1' }) },
      reaction: {
        deleteMany: jest
          .fn()
          .mockResolvedValue({ count: overrides.deleteCount ?? 0 }),
        create,
        findMany: jest.fn().mockResolvedValue([{ emoji: '👍', userId: 'u1' }]),
      },
    } as unknown as PrismaService,
    create,
  };
}

function makeService(prisma: PrismaService) {
  // Held as a local rather than read back off `events` at the assertion, so the expectation is
  // on a plain jest.fn() and not an unbound method reference.
  const emit = jest.fn();
  const events = { emit } as unknown as EventEmitter2;
  return { service: new ReactionsService(prisma, events), emit };
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('ReactionsService.toggle', () => {
  it('adds the reaction when the delete removed nothing', async () => {
    const { prisma, create } = makePrisma({ deleteCount: 0 });
    const { service, emit } = makeService(prisma);

    const result = await service.toggle('g1', 'm1', 'u1', '👍');

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ emoji: '👍', userId: 'u1' }]);
    expect(emit).toHaveBeenCalledWith(
      REACTION_CHANGED,
      expect.objectContaining({ groupId: 'g1', messageId: 'm1' }),
    );
  });

  it('removes the reaction without re-adding it when one was deleted', async () => {
    const { prisma, create } = makePrisma({ deleteCount: 1 });
    const { service } = makeService(prisma);

    await service.toggle('g1', 'm1', 'u1', '👍');

    // deleteMany's count is the existence test — a removal must not fall through to a create.
    expect(create).not.toHaveBeenCalled();
  });

  // The race this method used to lose: two concurrent taps both saw "absent", both inserted, and
  // the unique constraint turned the loser into an uncaught P2002 → 409.
  it('treats a concurrent duplicate insert as success, not a 409', async () => {
    const { prisma } = makePrisma({
      deleteCount: 0,
      createImpl: () => Promise.reject(p2002()),
    });
    const { service, emit } = makeService(prisma);

    const result = await service.toggle('g1', 'm1', 'u1', '👍');

    expect(result).toEqual([{ emoji: '👍', userId: 'u1' }]);
    expect(emit).toHaveBeenCalled();
  });

  it('still propagates a non-P2002 database error', async () => {
    const { prisma } = makePrisma({
      deleteCount: 0,
      createImpl: () => Promise.reject(new Error('connection lost')),
    });
    const { service } = makeService(prisma);

    await expect(service.toggle('g1', 'm1', 'u1', '👍')).rejects.toThrow(
      'connection lost',
    );
  });

  it('rejects a message that is not in this group', async () => {
    const { prisma } = makePrisma({});
    (prisma.message.findFirst as jest.Mock).mockResolvedValue(null);
    const { service } = makeService(prisma);

    await expect(
      service.toggle('g1', 'nope', 'u1', '👍'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
