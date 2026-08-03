/**
 * HOW THIS FILE WORKS
 *   1. Take a `since` timestamp — the start of the summary window.
 *   2. Ask MongoDB for every group with at least one USER message at or after it.
 *   3. Select only the id, which is all the scheduler needs to build a Flow.
 *
 * The single query behind the scheduler's fan-out; it decides how many Flows a tick creates.
 */
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessageType } from '../modules/messages/schemas/message.schema';

import { MessageRepository } from '../common/database/repositories/message.repository';

/** Domain queries for the summary jobs. Keeps MongoDB out of the processors. */
@Injectable()
export class SummaryService {
  constructor(private readonly messages: MessageRepository) {}

  /** Groups with at least one USER message since `since` — the ones worth summarizing. */
  async findActiveGroups(since: Date): Promise<{ id: string }[]> {
    const groupIds = await this.messages.aggregate<{ id: Types.ObjectId }>([
      {
        $match: {
          type: MessageType.USER,
          createdAt: { $gte: since },
          deletedAt: null,
        },
      },
      {
        $group: { _id: '$groupId' },
      },
      {
        $project: { id: '$_id', _id: 0 },
      },
    ]);
    return groupIds.map((g) => ({ id: g.id.toString() }));
  }
}
