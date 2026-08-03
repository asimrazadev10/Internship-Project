import { MessageType } from '../../modules/messages/schemas/message.schema';

import { PublishProcessor } from './publish.processor';
import type { SaveResult } from './stage.types';
import type { BroadcastMessage } from '../../messages/message-events';

function make() {
  const publisher = { broadcastNewMessage: jest.fn() };
  const processor = new PublishProcessor(publisher as never);
  return { processor, publisher };
}

const jobWith = (child: SaveResult) =>
  ({
    getChildrenValues: jest
      .fn()
      .mockResolvedValue({ 'bull:summary-queue:save-summary:g1:1': child }),
  }) as never;

const message: BroadcastMessage = {
  id: 'm1',
  groupId: 'g1',
  content: 'digest',
  type: MessageType.AI_SUMMARY,
  createdAt: new Date(),
  editedAt: null,
  deletedAt: null,
  senderId: null,
  sender: null,
  reactions: [],
  attachmentUrl: null,
  attachmentName: null,
  attachmentMime: null,
};

describe('PublishProcessor', () => {
  it('broadcasts the saved message', async () => {
    const { processor, publisher } = make();
    const res = await processor.process(jobWith({ skipped: false, message }));
    expect(publisher.broadcastNewMessage).toHaveBeenCalledWith(message);
    expect(res).toEqual({ published: true });
  });

  it('no-ops when save skipped', async () => {
    const { processor, publisher } = make();
    const res = await processor.process(jobWith({ skipped: true }));
    expect(publisher.broadcastNewMessage).not.toHaveBeenCalled();
    expect(res).toEqual({ published: false });
  });

  it('no-ops when there is no child value at all', async () => {
    const { processor, publisher } = make();
    const job = { getChildrenValues: jest.fn().mockResolvedValue({}) } as never;
    const res = await processor.process(job);
    expect(publisher.broadcastNewMessage).not.toHaveBeenCalled();
    expect(res).toEqual({ published: false });
  });
});
