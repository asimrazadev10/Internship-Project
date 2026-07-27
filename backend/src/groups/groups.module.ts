import { Module } from '@nestjs/common';

import { GroupMemberGuard } from './group-member.guard';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

/**
 * Owns the membership rule and the guard that applies it over HTTP.
 *
 * GroupMemberGuard is EXPORTED rather than re-provided in each consuming module, because it now
 * depends on GroupsService: any module whose controllers use @UseGuards(GroupMemberGuard) imports
 * this module and gets both. That also removes the duplicate provider registration MessagesModule
 * and ReactionsModule used to carry.
 *
 * GroupsService is exported for ChatGateway, which applies the same rule on the socket path.
 */
@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupMemberGuard],
  exports: [GroupsService, GroupMemberGuard],
})
export class GroupsModule {}
