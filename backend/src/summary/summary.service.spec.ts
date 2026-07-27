import { SummaryService } from './summary.service';

describe('SummaryService.findActiveGroups', () => {
  it('returns only groups that have a USER message since the window start', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
    const prisma = { group: { findMany } } as never;
    const service = new SummaryService(prisma);
    const since = new Date('2026-07-22T00:00:00Z');

    const groups = await service.findActiveGroups(since);

    expect(groups).toEqual([{ id: 'g1' }, { id: 'g2' }]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messages: { some: { type: 'USER', createdAt: { gte: since } } },
        },
        select: { id: true },
      }),
    );
  });
});
