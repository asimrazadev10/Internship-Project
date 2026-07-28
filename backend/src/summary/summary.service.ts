/**
 * HOW THIS FILE WORKS
 *   1. Take a `since` timestamp — the start of the summary window.
 *   2. Ask Postgres for every group with at least one USER message at or after it.
 *   3. Select only the id, which is all the scheduler needs to build a Flow.
 *
 * The single query behind the scheduler's fan-out; it decides how many Flows a tick creates.
 */
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
        // Step 2. `some` compiles to EXISTS, so Postgres stops at the first match per group.
        messages: {
          // USER only: otherwise yesterday's AI_SUMMARY would keep a dead group alive forever.
          some: { type: MessageType.USER, createdAt: { gte: since } },
        },
      },
      // Step 3. Id only — anything else would be rows over the wire that nothing reads.
      select: { id: true },
    });
  }
}
