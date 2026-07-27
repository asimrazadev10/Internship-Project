import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { StorageModule } from '../storage/storage.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';

/**
 * Owns messages and their reactions.
 *
 * Reactions had their own module, but they are not a feature boundary: the controller and service
 * already live in this folder, the route is nested UNDER a message
 * (groups/:id/messages/:messageId/reactions), and CLAUDE.md's own module list does not include
 * reactions. The separate @Module bought nothing and cost an extra app.module registration plus a
 * duplicate GroupMemberGuard provider. The controller and service stay as their own FILES — only
 * the module wrapper is gone.
 *
 * GroupsModule is imported for GroupMemberGuard, which both controllers apply. The guard delegates
 * to GroupsService, so it cannot be provided standalone here.
 *
 * PrismaModule is global, so no explicit import is needed for the DB. StorageModule supplies the
 * upload service used by the file-upload route.
 */
@Module({
  imports: [GroupsModule, StorageModule],
  controllers: [MessagesController, ReactionsController],
  providers: [MessagesService, ReactionsService],
  exports: [MessagesService],
})
export class MessagesModule {}
