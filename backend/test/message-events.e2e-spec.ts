import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

import { AppModule } from './../src/app.module';
import { MessagesService } from './../src/messages/messages.service';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  MESSAGE_CREATED,
  MessageCreatedPayload,
} from './../src/messages/message-events';

describe('MessagesService events (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let messages: MessagesService;
  let events: EventEmitter2;
  let userId: string;
  let groupId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    prisma = app.get(PrismaService);
    messages = app.get(MessagesService);
    events = app.get(EventEmitter2);
    await app.init();

    const user = await prisma.user.create({
      data: { email: `evt-${Date.now()}@example.com`, name: 'Evt', password: 'x' },
    });
    userId = user.id;
    const group = await prisma.group.create({ data: { name: 'Evt Group', createdBy: userId } });
    groupId = group.id;
    await prisma.groupMember.create({ data: { groupId, userId, role: 'OWNER' } });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('emits message.created with the persisted message', async () => {
    const received = new Promise<MessageCreatedPayload>((resolve) => {
      events.once(MESSAGE_CREATED, (p: MessageCreatedPayload) => resolve(p));
    });

    const created = await messages.create(groupId, userId, 'hello events');
    const payload = await received;

    expect(payload.message.id).toBe(created.id);
    expect(payload.message.content).toBe('hello events');
    expect(payload.message.sender?.name).toBe('Evt');
  });
});
