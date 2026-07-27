import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { GroupsModule } from '../groups/groups.module';
import { MessagesModule } from '../messages/messages.module';
import { ChatGateway } from './chat.gateway';
import { PresenceService } from './presence.service';

@Module({
  // JwtModule.register({}) provides JwtService; the auth middleware passes the secret per verify
  // call. GroupsModule supplies the membership rule the gateway re-checks on join; MessagesModule
  // supplies the write path behind send_message.
  imports: [JwtModule.register({}), GroupsModule, MessagesModule],
  providers: [ChatGateway, PresenceService],
})
export class ChatModule {}
