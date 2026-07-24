import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { ReactionsService } from './reactions.service';

/**
 * Nested under a group's message; GroupMemberGuard reads the :id (group) param so only members can
 * react. A single toggle endpoint keeps the UI a one-tap add/remove.
 */
@Controller('groups/:id/messages/:messageId/reactions')
@UseGuards(GroupMemberGuard)
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Post()
  @ResponseMessage('Reaction updated')
  toggle(
    @Param('id', ParseUuidPipe) groupId: string,
    @Param('messageId', ParseUuidPipe) messageId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.reactions.toggle(groupId, messageId, userId, dto.emoji);
  }
}
