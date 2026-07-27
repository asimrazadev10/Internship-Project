import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';

/** GroupsModule supplies GroupMemberGuard, applied to the whole reactions controller. */
@Module({
  imports: [GroupsModule],
  controllers: [ReactionsController],
  providers: [ReactionsService],
})
export class ReactionsModule {}
