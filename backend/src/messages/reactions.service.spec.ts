import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import { MessageRepository } from '../common/database/repositories/message.repository';
import { ReactionRepository } from '../common/database/repositories/reaction.repository';
import { REACTION_CHANGED } from './message-events';
import { ReactionsService } from './reactions.service';

const GROUP_ID = '507f1f77bcf86cd799439011';
const REACTION_USER_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const USER_ID = '507f1f77bcf86cd799439014';

function makeRepos(overrides: {
  deleteResult?: boolean;
  createImpl?: () => Promise<unknown>;
}) {
  const create = jest
    .fn()
    .mockImplementation(overrides.createImpl ?? (() => Promise.resolve({})));
  return {
    messages: {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(MESSAGE_ID),
        groupId: new Types.ObjectId(GROUP_ID),
      }),
    } as unknown as MessageRepository,
    reactions: {
      deleteReaction: jest
        .fn()
        .mockResolvedValue(overrides.deleteResult ?? false),
      createReaction: create,
      findByMessage: jest.fn().mockResolvedValue([
        {
          emoji: '👍',
          userId: new Types.ObjectId(REACTION_USER_ID),
        },
      ]),
    } as unknown as ReactionRepository,
    create,
  };
}

function makeService(
  reactions: ReactionRepository,
  messages: MessageRepository,
) {
  const emit = jest.fn();
  const events = { emit } as unknown as EventEmitter2;
  return { service: new ReactionsService(messages, reactions, events), emit };
}

describe('ReactionsService.toggle', () => {
  it('adds the reaction when the delete removed nothing', async () => {
    const { messages, reactions, create } = makeRepos({ deleteResult: false });
    const { service, emit } = makeService(reactions, messages);

    const result = await service.toggle(GROUP_ID, MESSAGE_ID, USER_ID, '👍');

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ emoji: '👍', userId: REACTION_USER_ID }]);
    expect(emit).toHaveBeenCalledWith(
      REACTION_CHANGED,
      expect.objectContaining({ groupId: GROUP_ID, messageId: MESSAGE_ID }),
    );
  });

  it('removes the reaction without re-adding it when one was deleted', async () => {
    const { reactions, create } = makeRepos({ deleteResult: true });
    const { messages } = makeRepos({});
    const { service } = makeService(reactions, messages);

    await service.toggle(GROUP_ID, MESSAGE_ID, USER_ID, '👍');

    expect(create).not.toHaveBeenCalled();
  });

  // The race this method used to lose: two concurrent taps both saw "absent", both inserted, and
  // the unique constraint turned the loser into an error.
  it('treats a concurrent duplicate insert as success, not a 409', async () => {
    const { messages, reactions } = makeRepos({
      deleteResult: false,
      createImpl: () => {
        const err = new Error('duplicate key') as Error & { code?: number };
        err.code = 11000;
        return Promise.reject(err);
      },
    });
    const { service, emit } = makeService(reactions, messages);

    const result = await service.toggle(GROUP_ID, MESSAGE_ID, USER_ID, '👍');

    expect(result).toEqual([{ emoji: '👍', userId: REACTION_USER_ID }]);
    expect(emit).toHaveBeenCalled();
  });

  it('still propagates a non-duplicate database error', async () => {
    const { messages, reactions } = makeRepos({
      deleteResult: false,
      createImpl: () => Promise.reject(new Error('connection lost')),
    });
    const { service } = makeService(reactions, messages);

    await expect(
      service.toggle(GROUP_ID, MESSAGE_ID, USER_ID, '👍'),
    ).rejects.toThrow('connection lost');
  });

  it('rejects a message that is not in this group', async () => {
    const { messages, reactions } = makeRepos({});
    (messages.findById as jest.Mock).mockResolvedValue(null);
    const { service } = makeService(reactions, messages);

    await expect(
      service.toggle(GROUP_ID, MESSAGE_ID, USER_ID, '👍'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
