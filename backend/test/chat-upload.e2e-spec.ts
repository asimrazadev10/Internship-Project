import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { TestDb } from './test-db';
import { StorageService } from './../src/storage/storage.service';

/**
 * Storage is mocked so the suite runs without a live Supabase project: the endpoint's own logic
 * (auth, membership, file validation, message creation) is what's under test here, not the bytes
 * actually reaching object storage.
 */
const storageMock = {
  configured: true,
  upload: jest.fn(
    (
      _groupId: string,
      file: { originalname: string; mimetype: string; size: number },
    ) =>
      Promise.resolve({
        url: `https://fake.supabase.co/storage/v1/object/public/chat-uploads/${file.originalname}`,
        name: file.originalname,
        mime: file.mimetype,
        size: file.size,
      }),
  ),
};

// A real 1×1 transparent PNG. FileTypeValidator checks magic numbers (file content), not just the
// declared MIME type, so the bytes must actually be a PNG — a security win over trusting the header.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('File uploads (e2e)', () => {
  let app: INestApplication;
  let prisma: TestDb;
  let memberId: string;
  let outsiderId: string;
  let groupId: string;
  let memberToken: string;
  let outsiderToken: string;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(storageMock)
      .compile();
    app = mod.createNestApplication();
    prisma = new TestDb(app);
    await app.init();

    const stamp = Date.now();
    const member = await prisma.user.create({
      data: { email: `up-a-${stamp}@example.com`, name: 'UpA', password: 'x' },
    });
    const outsider = await prisma.user.create({
      data: { email: `up-o-${stamp}@example.com`, name: 'UpO', password: 'x' },
    });
    memberId = member.id;
    outsiderId = outsider.id;

    const group = await prisma.group.create({
      data: { name: 'Upload Group', createdBy: memberId },
    });
    groupId = group.id;
    await prisma.groupMember.create({
      data: { groupId, userId: memberId, role: 'OWNER' },
    });

    const jwt = app.get(JwtService);
    const secret = app
      .get(ConfigService)
      .getOrThrow<string>('JWT_ACCESS_SECRET');
    memberToken = await jwt.signAsync(
      { sub: memberId, email: member.email },
      { secret, expiresIn: '5m' },
    );
    outsiderToken = await jwt.signAsync(
      { sub: outsiderId, email: outsider.email },
      { secret, expiresIn: '5m' },
    );
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({
      where: { id: { in: [memberId, outsiderId] } },
    });
    await app.close();
  });

  it('stores a file and creates a message carrying its URL + caption', async () => {
    const res = await request(server())
      .post(`/groups/${groupId}/messages/upload`)
      .set('Authorization', `Bearer ${memberToken}`)
      .field('content', 'look at this')
      .attach('file', PNG_1X1, {
        filename: 'hello.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(storageMock.upload).toHaveBeenCalled();
    expect(res.body.data).toMatchObject({
      content: 'look at this',
      attachmentName: 'hello.png',
      attachmentMime: 'image/png',
    });
    expect(res.body.data.attachmentUrl).toContain('hello.png');

    // The row really exists with the attachment.
    const row = await prisma.message.findUnique({
      where: { id: res.body.data.id },
    });
    expect(row?.attachmentUrl).toBeTruthy();
  });

  it('rejects a disallowed file type (422)', async () => {
    // A plain-text file: not in the image/PDF allow-list, and its content has no matching
    // magic number, so validation fails before the handler runs.
    await request(server())
      .post(`/groups/${groupId}/messages/upload`)
      .set('Authorization', `Bearer ${memberToken}`)
      .attach('file', Buffer.from('just some notes'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(422);
  });

  it('refuses a non-member (403)', async () => {
    await request(server())
      .post(`/groups/${groupId}/messages/upload`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .attach('file', PNG_1X1, {
        filename: 'hello.png',
        contentType: 'image/png',
      })
      .expect(403);
  });
});
