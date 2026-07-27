import { Module } from '@nestjs/common';

import { SummaryMessagesService } from './summary-messages.service';

/**
 * A deliberately minimal module so the standalone summary worker can get exactly the message
 * queries it needs, without importing MessagesModule.
 *
 * That import was the problem this solves: MessagesModule drags in MessagesService (and therefore
 * EventEmitter2), the HTTP controllers, StorageModule and GroupsModule — none of which a worker
 * with no HTTP server uses. PrismaModule is global, so this module needs no imports of its own.
 */
@Module({
  providers: [SummaryMessagesService],
  exports: [SummaryMessagesService],
})
export class SummaryMessagesModule {}
