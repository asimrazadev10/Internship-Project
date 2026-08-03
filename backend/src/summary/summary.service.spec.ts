import { Types } from 'mongoose';

import { SummaryService } from './summary.service';

describe('SummaryService.findActiveGroups', () => {
  it('returns only groups that have a USER message since the window start', async () => {
    const groupId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const aggregate = jest.fn().mockResolvedValue([{ id: groupId }]);
    const service = new SummaryService({ aggregate } as never);
    const since = new Date('2026-07-22T00:00:00Z');

    const groups = await service.findActiveGroups(since);

    expect(groups).toEqual([{ id: groupId.toString() }]);
    expect(aggregate).toHaveBeenCalledWith([
      {
        $match: {
          type: 'USER',
          createdAt: { $gte: since },
          deletedAt: null,
        },
      },
      { $group: { _id: '$groupId' } },
      { $project: { id: '$_id', _id: 0 } },
    ]);
  });
});
