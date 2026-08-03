import { Injectable } from '@nestjs/common';
import {
  Model,
  Document,
  FilterQuery,
  UpdateQuery,
  QueryOptions,
  ClientSession,
  Types,
} from 'mongoose';
import { MongoSessionService } from '../mongo-session.service';

export interface Cursor {
  createdAt: Date;
  id: Types.ObjectId;
}

export interface PaginationResult<T> {
  data: T[];
  meta: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

interface DocumentWithCreatedAt extends Document {
  createdAt: Date;
  _id: Types.ObjectId;
}

@Injectable()
export abstract class BaseRepository<T extends Document> {
  constructor(
    protected readonly model: Model<T>,
    protected readonly sessionService: MongoSessionService,
  ) {}

  private toSession(session?: ClientSession): ClientSession | null {
    return session ?? null;
  }

  async findById(
    id: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<T | null> {
    return this.model.findById(id).session(this.toSession(session)).exec();
  }

  async findOne(
    filter: FilterQuery<T>,
    session?: ClientSession,
  ): Promise<T | null> {
    return this.model.findOne(filter).session(this.toSession(session)).exec();
  }

  async find(
    filter: FilterQuery<T>,
    options?: QueryOptions<T>,
    session?: ClientSession,
  ): Promise<T[]> {
    return this.model
      .find(filter, null, options)
      .session(this.toSession(session))
      .exec();
  }

  async findWithPagination(
    filter: FilterQuery<T>,
    limit: number,
    cursor?: Cursor,
    sort: Record<string, 1 | -1> = { createdAt: -1, _id: -1 },
    session?: ClientSession,
  ): Promise<PaginationResult<T>> {
    const query = { ...filter };
    if (cursor) {
      query.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    const rows = await this.model
      .find(query)
      .sort(sort)
      .limit(limit + 1)
      .session(this.toSession(session))
      .exec();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    let nextCursor: string | null = null;
    if (hasMore && last) {
      const doc = last as unknown as DocumentWithCreatedAt;
      nextCursor = Buffer.from(
        JSON.stringify({
          createdAt: doc.createdAt.toISOString(),
          id: doc._id.toString(),
        }),
      ).toString('base64');
    }

    return { data: page, meta: { limit, nextCursor, hasMore } };
  }

  async create(data: Partial<T>, session?: ClientSession): Promise<T> {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  async createMany(data: Partial<T>[], session?: ClientSession): Promise<T[]> {
    return this.model.create(data, { session });
  }

  async updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    session?: ClientSession,
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate(filter, update, { new: true, session })
      .exec();
  }

  async updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateMany(filter, update, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async deleteOne(
    filter: FilterQuery<T>,
    session?: ClientSession,
  ): Promise<boolean> {
    const result = await this.model.deleteOne(filter, { session }).exec();
    return result.deletedCount > 0;
  }

  async deleteMany(
    filter: FilterQuery<T>,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.model.deleteMany(filter, { session }).exec();
    return result.deletedCount;
  }

  async count(
    filter: FilterQuery<T>,
    session?: ClientSession,
  ): Promise<number> {
    return this.model
      .countDocuments(filter)
      .session(this.toSession(session))
      .exec();
  }

  async exists(
    filter: FilterQuery<T>,
    session?: ClientSession,
  ): Promise<boolean> {
    const count = await this.model
      .countDocuments(filter)
      .limit(1)
      .session(this.toSession(session))
      .exec();
    return count > 0;
  }

  async aggregate<T = any>(
    pipeline: any[],
    session?: ClientSession,
  ): Promise<T[]> {
    return this.model
      .aggregate(pipeline)
      .session(this.toSession(session))
      .exec() as Promise<T[]>;
  }

  async withTransaction<R>(
    callback: (session: ClientSession) => Promise<R>,
  ): Promise<R> {
    return this.sessionService.withTransaction(callback);
  }
}
