import { Module } from '@nestjs/common';

import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { StorageModule } from '../storage/storage.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

/**
 * GroupMemberGuard is provided here so Nest can inject its PrismaService dependency when the
 * controller applies it. PrismaModule is global, so no explicit import is needed for the DB.
 * StorageModule supplies the Supabase upload service used by the file-upload route.
 */
@Module({
  imports: [StorageModule],
  controllers: [MessagesController],
  providers: [MessagesService, GroupMemberGuard],
  exports: [MessagesService],
})
export class MessagesModule {}
