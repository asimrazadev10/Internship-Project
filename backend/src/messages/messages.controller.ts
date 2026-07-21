import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

/**
 * Nested under a group: every route is group-scoped, so GroupMemberGuard applies to the whole
 * controller. Combined with the global JwtAuthGuard, reaching any handler here means the caller
 * is authenticated AND a member of :id — exactly CLAUDE.md's read/post rule, enforced once.
 *
 * The :id param is the group id (kept consistent with the groups routes so one guard reads one
 * param name).
 */
@Controller('groups/:id/messages')
@UseGuards(GroupMemberGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ResponseMessage('Message sent')
  create(
    @Param('id', ParseUuidPipe) groupId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(groupId, userId, dto.content);
  }

  @Get()
  findPage(
    @Param('id', ParseUuidPipe) groupId: string,
    @Query() query: PaginationQueryDto,
  ) {
    // Returning { data, meta } signals the ResponseInterceptor to lift meta into the envelope.
    return this.messagesService.findPage(groupId, query.limit, query.cursor);
  }
}
