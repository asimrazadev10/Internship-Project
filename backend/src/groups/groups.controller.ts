/**
 * HOW THIS FILE WORKS
 *   1. POST / — create a group. No member guard: there is no group to be a member of yet.
 *   2. GET / — list the caller's own groups. Scoped by user id, so no guard is needed.
 *   3. GET /:id — read one group. Member-only.
 *   4. POST /:id/join — join. No member guard, by definition.
 *   5. POST /:id/read — mark read. Member-only.
 *
 * The guard is applied per route rather than on the class, because three of these five routes
 * cannot require membership.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { GroupMemberGuard } from './group-member.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { CreateGroupDto } from './dto/create-group.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { GroupsService } from './groups.service';

/**
 * All routes here require authentication (global JwtAuthGuard). The group-scoped read
 * (GET /:id) additionally requires membership via GroupMemberGuard. Create, list and join do
 * NOT use that guard: you cannot require membership to create a group, list your own, or join
 * one you are not yet in.
 */
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ResponseMessage('Group created')
  // Step 1. Creator comes from the token; the service also makes them the first member.
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(userId, dto.name);
  }

  @Get()
  // Step 2. The user id in the query is itself the authorisation — you only ever see your own.
  findMine(@CurrentUser('userId') userId: string) {
    return this.groupsService.findMyGroups(userId);
  }

  @Get(':id')
  // Step 3. Member-only, so a non-member cannot even learn the group exists.
  @UseGuards(GroupMemberGuard)
  findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.groupsService.findOne(id);
  }

  @Post(':id/join')
  // 200 not 201: joining twice is idempotent and creates nothing the second time.
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Joined group')
  join(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.groupsService.join(userId, id);
  }

  /** Mark the group read up to now, for the caller. Members only (GroupMemberGuard). */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GroupMemberGuard)
  @ResponseMessage('Marked as read')
  markRead(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.groupsService.markRead(userId, id);
  }

  /** Leave the group. Members only, so the guard also rejects a non-member with 403. */
  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GroupMemberGuard)
  @ResponseMessage('Left group')
  leave(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.groupsService.leave(userId, id);
  }

  /** Hand ownership to another member. The owner-only rule lives in the service transaction. */
  @Post(':id/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GroupMemberGuard)
  @ResponseMessage('Ownership transferred')
  transferOwnership(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.groupsService.transferOwnership(userId, id, dto.userId);
  }
}
