import { Module } from '@nestjs/common';

import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';

@Module({
  controllers: [ReactionsController],
  providers: [ReactionsService, GroupMemberGuard],
})
export class ReactionsModule {}
