import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { GroupsModule } from '../groups/groups.module';
import { MessagesModule } from '../messages/messages.module';
import { ChatGateway } from './chat.gateway';

@Module({
  // JwtModule.register({}) provides JwtService; the gateway passes the secret per verify call.
  // GroupsModule/MessagesModule are imported now so later tasks can inject their services.
  imports: [JwtModule.register({}), GroupsModule, MessagesModule],
  providers: [ChatGateway],
})
export class ChatModule {}
