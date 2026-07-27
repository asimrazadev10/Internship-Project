import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Mock the filesystem so the local-disk branch writes nothing real.
const mkdirMock = jest.fn();
const writeFileMock = jest.fn();
jest.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

import { StorageService, UploadedFileLike } from './storage.service';

const FILE: UploadedFileLike = {
  originalname: 'notes.png',
  mimetype: 'image/png',
  size: 3,
  buffer: Buffer.from('abc'),
};

const SUPABASE_ENV = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-role-key',
  SUPABASE_BUCKET: 'chat-uploads',
};

function makeService(env: Record<string, string | undefined>) {
  const config = {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const value = env[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new StorageService(config);
}

describe('StorageService.upload', () => {
  beforeEach(() => {
    mkdirMock.mockReset().mockResolvedValue(undefined);
    writeFileMock.mockReset().mockResolvedValue(undefined);
  });

  // The whole point of the fallback: uploads work on a fresh clone with no Supabase account.
  describe('with SUPABASE_* unset (local-disk fallback)', () => {
    it('writes the bytes to disk and returns a proxy-relative URL', async () => {
      const service = makeService({});

      const stored = await service.upload('group-1', FILE);

      expect(writeFileMock).toHaveBeenCalledTimes(1);
      const [writtenPath, writtenBytes] = writeFileMock.mock.calls[0];
      expect(String(writtenPath)).toContain('group-1');
      expect(writtenBytes).toBe(FILE.buffer);

      // Served by the backend's static /uploads route, reached through the Next /api proxy.
      expect(stored.url).toMatch(
        /^\/api\/uploads\/group-1\/[0-9a-f-]+-notes\.png$/,
      );
      expect(stored).toMatchObject({
        name: 'notes.png',
        mime: 'image/png',
        size: 3,
      });
    });

    it('strips path separators from a hostile filename', async () => {
      const service = makeService({});

      const stored = await service.upload('group-1', {
        ...FILE,
        originalname: '../../etc/passwd',
      });

      // Every non-[word/dot/dash] run collapses to '_', so the name cannot climb out of the
      // group's directory. Exactly two slashes remain: the ones this service put there.
      expect(stored.url.match(/\//g)).toHaveLength(4); // /api /uploads /group-1 /file
      expect(stored.url).not.toContain('..%2F');
      expect(stored.url).toMatch(/-\.{2}_\.{2}_etc_passwd$/);
    });
  });

  describe('with SUPABASE_* set', () => {
    afterEach(() => {
      delete (global as { fetch?: unknown }).fetch;
    });

    it('POSTs the raw bytes with the service key and returns the public URL', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      (global as { fetch?: unknown }).fetch = fetchMock;
      const service = makeService(SUPABASE_ENV);

      const stored = await service.upload('group-1', FILE);

      expect(writeFileMock).not.toHaveBeenCalled();
      const [endpoint, init] = fetchMock.mock.calls[0];
      expect(String(endpoint)).toContain(
        'https://proj.supabase.co/storage/v1/object/chat-uploads/group-1/',
      );
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer service-role-key');
      expect(stored.url).toContain(
        '/storage/v1/object/public/chat-uploads/group-1/',
      );
    });

    it('raises 503 when Supabase rejects the upload', async () => {
      (global as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('bucket not found'),
      });
      const service = makeService(SUPABASE_ENV);

      await expect(service.upload('group-1', FILE)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
