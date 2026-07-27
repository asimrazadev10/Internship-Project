import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** The subset of a multer upload this service actually reads (avoids a @types/multer dependency). */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** What an upload yields: a public URL plus the metadata persisted on the message row. */
export interface StoredFile {
  url: string;
  name: string;
  mime: string;
  size: number;
}

/**
 * Uploads attachment bytes. Two backends, chosen at runtime:
 *
 * - **Supabase Storage** (preferred, for production): the backend talks to the Storage REST API
 *   directly with `fetch` and the service-role key — no @supabase/supabase-js SDK. One fewer
 *   dependency, and the whole contract is visible in one method: a POST of the raw bytes, then a
 *   deterministic public URL. The service-role key never leaves the server; the browser only ever
 *   receives the resulting public URL.
 * - **Local disk** (fallback, for dev): when SUPABASE_* aren't configured, bytes are written under
 *   `uploads/<groupId>/` and served back through the backend's static `/uploads` route (reached by
 *   the browser via the Next `/api` proxy). This means uploads work out of the box with no external
 *   setup; wiring Supabase later is a pure config change, no code change.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when SUPABASE_URL and a service key are present — i.e. the Supabase path is used. */
  get configured(): boolean {
    return Boolean(
      this.config.get<string>('SUPABASE_URL') &&
      this.config.get<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  private get bucket(): string {
    // The default lives on the env schema (SUPABASE_BUCKET = 'chat-uploads'), like every other
    // defaulted setting — so the documented value and the effective value cannot disagree.
    return this.config.getOrThrow<string>('SUPABASE_BUCKET');
  }

  /**
   * Store a file under `<groupId>/<uuid>-<safeName>` and return its URL + metadata. Path is
   * namespaced by group so one group's uploads never collide with another's, and the uuid prefix
   * guarantees uniqueness even for repeated identical filenames.
   */
  async upload(groupId: string, file: UploadedFileLike): Promise<StoredFile> {
    // Keep only filename-safe characters and cap length so a hostile name can't build a path.
    const safeName =
      file.originalname.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
    const objectPath = `${groupId}/${randomUUID()}-${safeName}`;
    return this.configured
      ? this.uploadToSupabase(objectPath, file)
      : this.uploadToLocal(objectPath, file);
  }

  private async uploadToSupabase(
    objectPath: string,
    file: UploadedFileLike,
  ): Promise<StoredFile> {
    const root = this.config
      .getOrThrow<string>('SUPABASE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY');
    const endpoint = `${root}/storage/v1/object/${this.bucket}/${encodeURI(objectPath)}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': file.mimetype || 'application/octet-stream',
        'cache-control': '3600',
        'x-upsert': 'false',
      },
      // A Node Buffer isn't a valid BodyInit in the DOM fetch types; wrap it as a Uint8Array view.
      body: new Uint8Array(file.buffer),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(
        `Supabase upload failed (${res.status} ${res.statusText}): ${detail}`,
      );
      throw new ServiceUnavailableException('Upload failed');
    }

    return {
      url: `${root}/storage/v1/object/public/${this.bucket}/${encodeURI(objectPath)}`,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
  }

  private async uploadToLocal(
    objectPath: string,
    file: UploadedFileLike,
  ): Promise<StoredFile> {
    const absPath = join(StorageService.uploadsDir(), objectPath);
    await mkdir(join(absPath, '..'), { recursive: true });
    await writeFile(absPath, file.buffer);
    this.logger.log(
      `stored locally: uploads/${objectPath} (${file.size} bytes)`,
    );

    // Relative URL served by the backend's static /uploads route, reached from the browser through
    // the Next /api proxy (keeping everything same-origin, matching the app's proxy architecture).
    return {
      url: `/api/uploads/${objectPath}`,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
  }

  /** Absolute path of the local uploads directory (shared with main.ts's static route). */
  static uploadsDir(): string {
    return join(process.cwd(), 'uploads');
  }
}
