import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongoSessionService } from './mongo-session.service';
import { User, UserSchema } from '../../modules/users/schemas/user.schema';
import { Group, GroupSchema } from '../../modules/groups/schemas/group.schema';
import {
  GroupMember,
  GroupMemberSchema,
} from '../../modules/groups/schemas/group-member.schema';
import {
  Message,
  MessageSchema,
} from '../../modules/messages/schemas/message.schema';
import {
  Reaction,
  ReactionSchema,
} from '../../modules/messages/schemas/reaction.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../../modules/auth/schemas/refresh-token.schema';

import { UserRepository } from './repositories/user.repository';
import { GroupRepository } from './repositories/group.repository';
import { GroupMemberRepository } from './repositories/group-member.repository';
import { MessageRepository } from './repositories/message.repository';
import { ReactionRepository } from './repositories/reaction.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        autoIndex: process.env.NODE_ENV !== 'production',
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Group.name, schema: GroupSchema },
      { name: GroupMember.name, schema: GroupMemberSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Reaction.name, schema: ReactionSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  providers: [
    MongoSessionService,
    UserRepository,
    GroupRepository,
    GroupMemberRepository,
    MessageRepository,
    ReactionRepository,
    RefreshTokenRepository,
  ],
  exports: [
    MongoSessionService,
    UserRepository,
    GroupRepository,
    GroupMemberRepository,
    MessageRepository,
    ReactionRepository,
    RefreshTokenRepository,
  ],
})
export class DatabaseModule {}
