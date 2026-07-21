import { Module } from '@nestjs/common';

import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

/**
 * GroupMemberGuard is provided here (and in MessagesModule) so Nest's injector can construct it
 * with its PrismaService dependency wherever @UseGuards(GroupMemberGuard) is used. GroupsService
 * is exported for MessagesModule, which needs no group table access of its own beyond the guard.
 */
@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupMemberGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
