# MongoDB/Mongoose Migration Plan

## Overview
Replace Prisma/PostgreSQL with Mongoose/MongoDB while preserving all existing functionality:
- Authentication (JWT, refresh tokens, Google OAuth)
- Groups & Memberships
- Messages (create, edit, soft-delete, search, pagination)
- Real-time (Socket.IO)
- AI Summary Pipeline (BullMQ workers)
- File uploads

## Data Model Mapping

### Prisma → Mongoose Collections

| Prisma Model | MongoDB Collection | Key Changes |
|---|---|---|
| User | `users` | Use `_id` as ObjectId, add `providerId` index |
| Group | `groups` | Embed `createdBy` as ObjectId ref |
| GroupMember | `groupmembers` | Compound unique index on `groupId + userId` |
| Message | `messages` | Compound index on `groupId + createdAt + _id` |
| RefreshToken | `refreshtokens` | TTL index on `expiresAt` |
| Reaction | `reactions` | Compound unique index on `messageId + userId + emoji` |

### Enums → String constants
- `AuthProvider` → 'LOCAL' | 'GOOGLE'
- `MemberRole` → 'OWNER' | 'ADMIN' | 'MEMBER'
- `MessageType` → 'USER' | 'SYSTEM' | 'AI_SUMMARY'

## Implementation Phases

### Phase 1: Infrastructure & Core Models
1. Install Mongoose dependencies
2. Create Mongoose schemas with:
   - Pre/post hooks for cascading deletes, validation
   - Virtuals for population
   - Static methods for common queries
   - Instance methods for business logic
3. Create MongoDB connection module
4. Environment config for MongoDB URI

### Phase 2: Service Migration (Repository Pattern)
Create repository classes that mirror PrismaService interface:
- `UserRepository`
- `GroupRepository`
- `GroupMemberRepository`
- `MessageRepository`
- `RefreshTokenRepository`
- `ReactionRepository`

Each repository wraps Mongoose models with methods matching Prisma's API:
- `findUnique`, `findFirst`, `findMany`, `create`, `update`, `delete`, `count`
- Transaction support via MongoDB sessions

### Phase 3: Authentication Module
- `TokenService` - refresh token rotation with MongoDB sessions
- `PasswordService` - unchanged (argon2)
- `GoogleService` - unchanged
- `AuthService` - uses repositories

### Phase 4: Groups Module
- `GroupsService` - uses repositories
- `GroupMemberGuard` - uses repositories
- Event emissions unchanged

### Phase 5: Messages Module
- `MessagesService` - cursor pagination with aggregation
- `SummaryMessagesService` - aggregation pipeline for summaries
- Search with `$regex` + case-insensitive
- Keyset pagination using `$gt`/`$lt` on `_id` (ObjectId has timestamp)

### Phase 6: AI Summary Pipeline
- `SchedulerProcessor` - finds active groups via aggregation
- `SummaryProcessor` - fetch/save/groupSummary stages
- `GenerateProcessor` - unchanged (Gemini)
- `PublishProcessor` - unchanged (redis-emitter)

### Phase 7: Health & Configuration
- Health checks for MongoDB
- Env validation for MongoDB URI
- Remove Prisma dependencies

### Phase 8: Testing & QA
- Run existing e2e tests
- Add MongoDB-specific tests
- Performance benchmarks

## Mongoose Schema Design Details

### User Schema
```typescript
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false }, // nullable for OAuth
  name: { type: String, required: true, trim: true },
  provider: { type: String, enum: ['LOCAL', 'GOOGLE'], default: 'LOCAL' },
  providerId: { type: String, sparse: true }, // Google sub
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false }); // createdAt handled manually

// Compound unique index for OAuth
userSchema.index({ provider: 1, providerId: 1 }, { unique: true, sparse: true });

// Pre-save hook: ensure email lowercase
userSchema.pre('save', function(next) {
  if (this.isModified('email')) this.email = this.email.toLowerCase();
  next();
});

// Instance method: toEntity() strips password
```

### Group Schema
```typescript
const groupSchema = new Schema({
  name: { type: String, required: true, trim: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

// Unique constraint: one creator cannot have two groups with same name
groupSchema.index({ createdBy: 1, name: 1 }, { unique: true });
groupSchema.index({ createdAt: -1 });
```

### GroupMember Schema
```typescript
const groupMemberSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['OWNER', 'ADMIN', 'MEMBER'], default: 'MEMBER' },
  joinedAt: { type: Date, default: Date.now },
  lastReadAt: { type: Date }
});

// Prevent double-join
groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMemberSchema.index({ userId: 1 });

// Pre-remove hook: if owner leaving, handle promotion/deletion in service (transaction)
```

### Message Schema
```typescript
const messageSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User' }, // nullable for SYSTEM/AI
  content: { type: String, required: true },
  type: { type: String, enum: ['USER', 'SYSTEM', 'AI_SUMMARY'], default: 'USER' },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
  deletedAt: { type: Date },
  attachmentUrl: { type: String },
  attachmentName: { type: String },
  attachmentMime: { type: String }
});

// Keyset pagination index
messageSchema.index({ groupId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ groupId: 1, type: 1, deletedAt: 1, createdAt: -1 }); // for search

// Virtual for population
messageSchema.virtual('sender', {
  ref: 'User',
  localField: 'senderId',
  foreignField: '_id',
  justOne: true
});

// Instance method: isOwnedBy(userId)
// Instance method: isEditable() - USER type, not deleted
```

### RefreshToken Schema
```typescript
const refreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  familyId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ familyId: 1 });
// TTL index for auto-cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

### Reaction Schema
```typescript
const reactionSchema = new Schema({
  messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

reactionSchema.index({ messageId: 1, userId: 1, emoji: 1 }, { unique: true });
reactionSchema.index({ userId: 1 });
```

## Aggregation Pipelines

### 1. Find Active Groups (for summary scheduler)
```typescript
async findActiveGroups(since: Date): Promise<Group[]> {
  return Message.aggregate([
    { $match: { createdAt: { $gte: since }, type: 'USER', deletedAt: null } },
    { $group: { _id: '$groupId' } },
    { $lookup: {
      from: 'groups',
      localField: '_id',
      foreignField: '_id',
      as: 'group'
    }},
    { $unwind: '$group' },
    { $replaceRoot: { newRoot: '$group' } }
  ]);
}
```

### 2. Keyset Pagination (cursor-based)
```typescript
async findPage(groupId: ObjectId, limit: number, cursor?: Cursor) {
  const match: any = { groupId };
  if (cursor) {
    // ObjectId timestamp + tiebreaker
    match.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }
    ];
  }
  const rows = await Message.find(match)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('sender', 'name')
    .lean();
  // ... cursor encoding logic
}
```

### 3. Search Messages
```typescript
async search(groupId: ObjectId, query: string) {
  return Message.find({
    groupId,
    type: 'USER',
    deletedAt: null,
    content: { $regex: query, $options: 'i' }
  })
  .sort({ createdAt: -1, _id: -1 })
  .limit(SEARCH_RESULT_LIMIT)
  .populate('sender', 'name')
  .lean();
}
```

### 4. Has Summary Since (idempotency)
```typescript
async hasSummarySince(groupId: ObjectId, since: Date): Promise<boolean> {
  const count = await Message.countDocuments({
    groupId,
    type: 'AI_SUMMARY',
    createdAt: { $gte: since }
  });
  return count > 0;
}
```

### 5. Find Messages for Summary (transcript)
```typescript
async findForSummary(groupId: ObjectId, since: Date) {
  return Message.find({
    groupId,
    type: 'USER',
    createdAt: { $gte: since },
    deletedAt: null
  })
  .sort({ createdAt: 1 }) // oldest first
  .populate('sender', 'name')
  .select('content createdAt sender')
  .lean();
}
```

### 6. My Groups with Counts
```typescript
async findMyGroups(userId: ObjectId) {
  return GroupMember.aggregate([
    { $match: { userId } },
    { $lookup: {
      from: 'groups',
      localField: 'groupId',
      foreignField: '_id',
      as: 'group'
    }},
    { $unwind: '$group' },
    { $lookup: {
      from: 'groupmembers',
      localField: 'group._id',
      foreignField: 'groupId',
      as: 'members'
    }},
    { $lookup: {
      from: 'messages',
      localField: 'group._id',
      foreignField: 'groupId',
      as: 'messages'
    }},
    { $project: {
      _id: '$group._id',
      name: '$group.name',
      createdBy: '$group.createdBy',
      createdAt: '$group.createdAt',
      memberCount: { $size: '$members' },
      messageCount: { $size: '$messages' }
    }},
    { $sort: { createdAt: -1 } }
  ]);
}
```

## Pre/Post Hooks Usage

### User
- `pre('save')`: lowercase email
- `pre('deleteOne')`: cascade delete refreshTokens, reactions, groupMemberships

### Group
- `pre('deleteOne')`: cascade delete messages, groupMembers (handled by service transaction)

### GroupMember
- `pre('deleteOne')`: if OWNER, handle in service (not hook - needs transaction)

### Message
- `pre('save')`: if editedAt set, ensure not deleted
- `pre('deleteOne')`: cascade delete reactions

### RefreshToken
- TTL index handles expiry cleanup
- `pre('save')`: ensure tokenHash unique

## Transaction Strategy

MongoDB transactions (sessions) for:
1. Group creation + owner membership
2. Owner leave + promotion/deletion
3. Ownership transfer (role swap)
4. Refresh token rotation (conditional update)

## Environment Variables

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/chatdb
# Remove DATABASE_URL, POSTGRES_*
```

## Dependencies to Add
```json
{
  "mongoose": "^8.x",
  "@nestjs/mongoose": "^11.x"
}
```

## Dependencies to Remove
```json
{
  "@prisma/client": "^6.x",
  "prisma": "^6.x"
}
```

## File Structure Changes

```
backend/src/
├── common/
│   └── database/
│       ├── mongoose.module.ts
│       ├── mongo-session.service.ts
│       └── repositories/
│           ├── base.repository.ts
│           ├── user.repository.ts
│           ├── group.repository.ts
│           ├── group-member.repository.ts
│           ├── message.repository.ts
│           ├── refresh-token.repository.ts
│           └── reaction.repository.ts
├── config/
│   └── mongo.config.ts
├── modules/
│   ├── users/
│   │   ├── schemas/user.schema.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── groups/
│   │   ├── schemas/group.schema.ts
│   │   ├── schemas/group-member.schema.ts
│   │   ├── groups.service.ts
│   │   └── groups.module.ts
│   ├── messages/
│   │   ├── schemas/message.schema.ts
│   │   ├── schemas/reaction.schema.ts
│   │   ├── messages.service.ts
│   │   ├── summary-messages.service.ts
│   │   └── messages.module.ts
│   ├── auth/
│   │   ├── schemas/refresh-token.schema.ts
│   │   ├── token.service.ts
│   │   └── auth.module.ts
│   └── summary/
│       └── stages/
│           ├── scheduler.processor.ts
│           ├── summary.processor.ts
│           ├── fetch.processor.ts (new)
│           └── ...
```

## Testing Strategy

1. Unit tests for each repository method
2. Integration tests for services using test MongoDB (Testcontainers or in-memory)
3. E2E tests against real MongoDB cluster
4. Verify all existing e2e tests pass
5. Load test pagination and search

## Rollback Plan

Keep Prisma schema and migrations in git history. If issues arise:
1. `git checkout main`
2. `docker compose up -d` (Postgres + Redis)
3. `npm --prefix backend run prisma:migrate deploy`
4. `npm --prefix backend run start:dev`

---

## Next Steps

1. **User provides MongoDB cluster URI** → Add to `backend/.env`
2. **Create branch** → `mongodb-migration` (done)
3. **Implement Phase 1** → Infrastructure & Core Models
4. **Implement Phase 2-7** → Service Migration
5. **Run QA agents** → Test & Review