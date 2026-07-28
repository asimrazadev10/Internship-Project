/**
 * HOW THIS FILE WORKS
 *   1. GroupMemberGuard runs first, reading the :id param to prove membership.
 *   2. Both route params are validated as UUIDs.
 *   3. The user id comes from the verified token, never from the body.
 *   4. Delegate to ReactionsService.toggle.
 */
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { GroupMemberGuard } from '../groups/group-member.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { ReactionsService } from './reactions.service';

/**
 * Nested under a group's message; GroupMemberGuard reads the :id (group) param so only members can
 * react. A single toggle endpoint keeps the UI a one-tap add/remove.
 */
@Controller('groups/:id/messages/:messageId/reactions')
// Step 1. Applied at class level, so every route here is member-only.
@UseGuards(GroupMemberGuard)
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  // One POST for both add and remove — the server decides which, so the UI stays a single tap.
  @Post()
  @ResponseMessage('Reaction updated')
  toggle(
    // Step 2. Rejects a malformed id before it reaches Prisma.
    @Param('id', ParseUuidPipe) groupId: string,
    @Param('messageId', ParseUuidPipe) messageId: string,
    // Step 3. From request.user, so a caller cannot react on someone else's behalf.
    @CurrentUser('userId') userId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.reactions.toggle(groupId, messageId, userId, dto.emoji);
  }
}
