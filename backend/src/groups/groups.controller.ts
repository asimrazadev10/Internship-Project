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
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(userId, dto.name);
  }

  @Get()
  findMine(@CurrentUser('userId') userId: string) {
    return this.groupsService.findMyGroups(userId);
  }

  @Get(':id')
  @UseGuards(GroupMemberGuard)
  findOne(@Param('id', ParseUuidPipe) id: string) {
    return this.groupsService.findOne(id);
  }

  @Post(':id/join')
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
}
