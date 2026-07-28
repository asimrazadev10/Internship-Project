/**
 * HOW THIS FILE WORKS
 *
 *   1. Take a `since` timestamp — the start of the summary window.
 *   2. Ask Postgres for every group having at least one USER message at or after it.
 *   3. Select only the id, because the caller only needs something to build a Flow around.
 *
 * The single query behind the scheduler's fan-out. It runs in the scheduler-worker process and
 * decides how many Flows a tick creates: no active groups means no work, which is why a quiet
 * system costs nothing.
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
        // Step 2. `some` compiles to an EXISTS subquery, so Postgres stops at the first matching
        // message per group instead of counting them all.
        messages: {
          // type: USER excludes AI_SUMMARY deliberately — otherwise yesterday's summary would
          // itself count as activity and keep a dead group alive forever.
          some: { type: MessageType.USER, createdAt: { gte: since } },
        },
      },
      // Step 3. Id only. The scheduler passes it straight into buildSummaryFlow; fetching names
      // or timestamps here would be rows over the wire that nothing reads.
      select: { id: true },
    });
  }
}
