import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { StorageModule } from '../storage/storage.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

/**
 * GroupsModule is imported for GroupMemberGuard, which every route on MessagesController applies.
 * The guard delegates to GroupsService, so it can no longer be provided standalone here — which
 * also means it is now registered once, in the module that owns it, instead of twice.
 *
 * PrismaModule is global, so no explicit import is needed for the DB. StorageModule supplies the
 * upload service used by the file-upload route.
 */
@Module({
  imports: [GroupsModule, StorageModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
