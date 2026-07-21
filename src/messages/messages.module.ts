import { Module } from '@nestjs/common';

import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

/**
 * GroupMemberGuard is provided here so Nest can inject its PrismaService dependency when the
 * controller applies it. PrismaModule is global, so no explicit import is needed for the DB.
 */
@Module({
  controllers: [MessagesController],
  providers: [MessagesService, GroupMemberGuard],
})
export class MessagesModule {}
