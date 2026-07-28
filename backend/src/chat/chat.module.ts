/**
 * HOW THIS FILE WORKS
 *   1. Register JwtModule with an empty config — the middleware passes the secret per verify call.
 *   2. Import GroupsModule for the membership check the gateway re-runs on join.
 *   3. Import MessagesModule for the write path behind send_message.
 *   4. Declare the gateway and the presence service.
 */
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
  // Step 4. A gateway is declared as a provider, not a controller.
  providers: [ChatGateway, PresenceService],
})
export class ChatModule {}
