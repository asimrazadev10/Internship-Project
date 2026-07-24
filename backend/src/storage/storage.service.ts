import { randomUUID } from 'node:crypto';

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
 * Uploads attachment bytes to Supabase Storage.
 *
 * Design: the backend talks to the Storage REST API directly with `fetch` and the service-role
 * key — no @supabase/supabase-js SDK. One fewer dependency, and the whole contract is visible in
 * one method: a POST of the raw bytes, then a deterministic public URL. The service-role key never
 * leaves the server; the browser only ever receives the resulting public URL.
 *
 * Config is OPTIONAL at boot: SUPABASE_* are validated as optional so the app runs without file
 * uploads configured (every other feature is independent). A real upload attempted without
 * configuration fails fast with 503 rather than a confusing network error.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when SUPABASE_URL and a service key are present — i.e. uploads can actually run. */
  get configured(): boolean {
    return Boolean(
      this.config.get<string>('SUPABASE_URL') &&
        this.config.get<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  private get bucket(): string {
    return this.config.get<string>('SUPABASE_BUCKET') ?? 'chat-uploads';
  }

  /**
   * Store a file under `<groupId>/<uuid>-<safeName>` and return its public URL + metadata.
   * Path is namespaced by group so one group's uploads never collide with another's, and the
   * uuid prefix guarantees uniqueness even for repeated identical filenames.
   */
  async upload(groupId: string, file: UploadedFileLike): Promise<StoredFile> {
    const base = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_KEY');
    if (!base || !key) {
      throw new ServiceUnavailableException('File uploads are not configured');
    }

    // Keep only filename-safe characters and cap length so a hostile name can't build a path.
    const safeName =
      file.originalname.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
    const objectPath = `${groupId}/${randomUUID()}-${safeName}`;
    const root = base.replace(/\/$/, '');
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
}
