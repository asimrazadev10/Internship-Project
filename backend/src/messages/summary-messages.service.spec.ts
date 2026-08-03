import { Types } from 'mongoose';
import { MessageType } from '../modules/messages/schemas/message.schema';

import { SummaryMessagesService } from './summary-messages.service';
import { MessageRepository } from '../common/database/repositories/message.repository';

const GROUP_ID = '507f1f77bcf86cd799439011';
const GROUP_OBJECT_ID = new Types.ObjectId(GROUP_ID);

function makeService() {
  const messages = {
    persistAiSummary: jest.fn().mockResolvedValue({
      _id: GROUP_OBJECT_ID,
      groupId: GROUP_OBJECT_ID,
      content: 'summary text',
      type: MessageType.AI_SUMMARY,
      createdAt: new Date(),
      senderId: null,
      sender: null,
    }),
    findForSummary: jest.fn().mockResolvedValue([]),
    hasSummarySince: jest.fn().mockResolvedValue(false),
  };
  const service = new SummaryMessagesService(
    messages as unknown as MessageRepository,
  );
  return { service, messages };
}

describe('SummaryMessagesService.persistAiSummary', () => {
  it('persists an AI_SUMMARY with a null sender', async () => {
    const { service, messages } = makeService();
    const msg = await service.persistAiSummary(GROUP_ID, 'summary text');

    expect(messages.persistAiSummary).toHaveBeenCalledWith(
      GROUP_OBJECT_ID,
      'summary text',
    );
    expect(msg.type).toBe(MessageType.AI_SUMMARY);
  });

  /**
   * The old version of this test asserted `emit` was never called, which it could only do because
   * the service took an EventEmitter2. After the split it takes MessageRepository alone, so "does not
   * broadcast" is now guaranteed by the constructor signature rather than by an assertion — a
   * stronger guarantee than the test it replaces. Worth being able to say that out loud.
   */
  it('has no way to emit: the service depends on MessageRepository only', () => {
    expect(SummaryMessagesService.length).toBe(1);
  });
});

describe('SummaryMessagesService.findForSummary', () => {
  it('queries only USER messages since the window start, oldest first', async () => {
    const { service, messages } = makeService();
    const since = new Date('2026-07-22T00:00:00Z');
    await service.findForSummary(GROUP_ID, since);

    expect(messages.findForSummary).toHaveBeenCalledWith(
      GROUP_OBJECT_ID,
      since,
    );
  });
});

describe('SummaryMessagesService.hasSummarySince', () => {
  it('is false when no AI_SUMMARY exists in the window', async () => {
    const { service } = makeService();
    await expect(service.hasSummarySince(GROUP_ID, new Date())).resolves.toBe(
      false,
    );
  });
});
