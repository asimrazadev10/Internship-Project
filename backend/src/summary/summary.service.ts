import { Injectable } from '@nestjs/common';
import { MessageType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Domain queries for the summary jobs. Keeps Prisma out of the processors. */
@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Groups with at least one USER message since `since` — the ones worth summarizing. */
  findActiveGroups(since: Date): Promise<{ id: string }[]> {
    return this.prisma.group.findMany({
      where: {
        messages: {
          some: { type: MessageType.USER, createdAt: { gte: since } },
        },
      },
      select: { id: true },
    });
  }
}
