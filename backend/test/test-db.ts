/**
 * Mongoose-backed stand-in for the Prisma client used by the e2e specs.
 *
 * The e2e specs previously seeded and cleaned Postgres through PrismaService
 * (`prisma.user.create`, `prisma.group.deleteMany`, ...). With the MongoDB
 * migration the Prisma client is gone, so this class exposes the same tiny
 * subset of the Prisma API the specs rely on, backed by the Mongoose models
 * registered by DatabaseModule. Only the calls the specs actually make are
 * implemented: create / createMany / findUnique / count / deleteMany.
 */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../src/modules/users/schemas/user.schema';
import { Group } from '../src/modules/groups/schemas/group.schema';
import { GroupMember } from '../src/modules/groups/schemas/group-member.schema';
import { Message } from '../src/modules/messages/schemas/message.schema';

type AnyRecord = Record<string, any>;

const REF_KEYS = ['groupId', 'userId', 'senderId', 'createdBy'] as const;

function asObjectId(value: any): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

/** Convert a Prisma-style `where` object into a Mongo filter. */
function mapWhere(where: AnyRecord): AnyRecord {
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === 'id' && value && typeof value === 'object' && 'in' in value) {
      out._id = { $in: value.in };
    } else if (key === 'id') {
      out._id = value;
    } else if (key === 'groupId_userId') {
      out.groupId = asObjectId(value.groupId);
      out.userId = asObjectId(value.userId);
    } else if ((REF_KEYS as readonly string[]).includes(key)) {
      out[key] = asObjectId(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Convert a Prisma-style `data` object into Mongo field values. */
function mapData(data: AnyRecord): AnyRecord {
  const out: AnyRecord = { ...data };
  for (const key of REF_KEYS) {
    if (out[key] != null) {
      out[key] = asObjectId(out[key]);
    }
  }
  return out;
}

/** Serialize a document to a plain object (string ObjectIds and ISO dates). */
function toPlain<T>(doc: T | null): any {
  if (!doc) {
    return null;
  }
  return JSON.parse(JSON.stringify(doc));
}

export class TestDb {
  private readonly users: Model<any>;
  private readonly groups: Model<any>;
  private readonly groupMembers: Model<any>;
  private readonly messages: Model<any>;

  constructor(app: INestApplication) {
    this.users = app.get(getModelToken(User.name));
    this.groups = app.get(getModelToken(Group.name));
    this.groupMembers = app.get(getModelToken(GroupMember.name));
    this.messages = app.get(getModelToken(Message.name));
  }

  readonly user: {
    create: (args: { data: AnyRecord }) => Promise<any>;
    count: (args: { where: AnyRecord }) => Promise<number>;
    deleteMany: (args: { where: AnyRecord }) => Promise<any>;
  } = {
    create: ({ data }) => this.users.create(mapData(data)),
    count: ({ where }) => this.users.countDocuments(mapWhere(where)),
    deleteMany: ({ where }) => this.users.deleteMany(mapWhere(where)),
  };

  readonly group: {
    create: (args: { data: AnyRecord }) => Promise<any>;
    findUnique: (args: { where: AnyRecord }) => Promise<any>;
    count: (args: { where: AnyRecord }) => Promise<number>;
    deleteMany: (args: { where: AnyRecord }) => Promise<any>;
  } = {
    create: ({ data }) => this.groups.create(mapData(data)),
    findUnique: async ({ where }) => {
      const doc = await this.groups.findById(where.id);
      return toPlain(doc);
    },
    count: ({ where }) => this.groups.countDocuments(mapWhere(where)),
    deleteMany: ({ where }) => this.groups.deleteMany(mapWhere(where)),
  };

  readonly groupMember: {
    create: (args: { data: AnyRecord }) => Promise<any>;
    findUnique: (args: { where: AnyRecord }) => Promise<any>;
    deleteMany: (args: { where: AnyRecord }) => Promise<any>;
  } = {
    create: ({ data }) => this.groupMembers.create(mapData(data)),
    findUnique: async ({ where }) => {
      const doc = await this.groupMembers.findOne(mapWhere(where));
      return toPlain(doc);
    },
    deleteMany: ({ where }) => this.groupMembers.deleteMany(mapWhere(where)),
  };

  readonly message: {
    create: (args: { data: AnyRecord }) => Promise<any>;
    createMany: (args: { data: AnyRecord[] }) => Promise<any>;
    findUnique: (args: { where: AnyRecord }) => Promise<any>;
    count: (args: { where: AnyRecord }) => Promise<number>;
    deleteMany: (args: { where: AnyRecord }) => Promise<any>;
  } = {
    create: ({ data }) => this.messages.create(mapData(data)),
    createMany: ({ data }) => this.messages.create(data.map(mapData)),
    findUnique: async ({ where }) => {
      const doc = await this.messages.findById(where.id);
      return toPlain(doc);
    },
    count: ({ where }) => this.messages.countDocuments(mapWhere(where)),
    deleteMany: ({ where }) => this.messages.deleteMany(mapWhere(where)),
  };
}
