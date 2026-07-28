/**
 * HOW THIS FILE WORKS
 *   1. upload() sanitises the filename and derives the extension from the VALIDATED MIME.
 *   2. It builds an object path namespaced by group and prefixed with a uuid.
 *   3. `configured` decides the backend: Supabase when the env vars are set, local disk otherwise.
 *   4. uploadToSupabase() POSTs the raw bytes to the Storage REST API and returns a public URL.
 *   5. uploadToLocal() writes under uploads/ and returns a relative /api/uploads URL.
 *
 * Step 1 is a security control, not tidiness — see EXTENSION_FOR_MIME for the stored-XSS path it
 * closes.
 */
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

/**
 * The stored file extension for each allowed MIME type.
 *
 * The stored name's extension is DERIVED from the validated MIME, never carried over from the
 * uploader's filename, because the two are checked and used at different moments by different
 * code: ParseFilePipe validates the MIME at upload time, but Express's serve-static picks the
 * response Content-Type from the EXTENSION at serve time. Preserving a user-supplied extension
 * lets those two disagree — a genuine PNG named `evil.html` passes byte-level validation and is
 * then served as text/html from the app's own origin, which is stored XSS with the access token
 * in localStorage one script tag away.
 *
 * Keyed off messages/upload.constants.ts so the allow-list has one definition. That import
 * direction (storage <- messages) is safe: upload.constants.ts imports nothing, so there is no
 * cycle. `image/jpg` is present because the validator's RegExp deliberately accepts that
 * non-standard spelling.
 */
const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Anything not on the allow-list is stored inert, so serve-static sends octet-stream. */
const FALLBACK_EXTENSION = 'bin';

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
    // Step 3. `get`, not `getOrThrow` — absence is a valid state meaning "use local disk".
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
    // Drop the uploader's extension, then keep only filename-safe characters and cap length, so a
    // hostile name can neither build a path nor smuggle a second extension through. Dots are NOT
    // in the allowed set here — the only dot in the stored name is the one this method adds below.
    const stem =
      file.originalname
        .replace(/\.[^.]*$/, '')
        .replace(/[^\w-]+/g, '_')
        .slice(-80) || 'file';
    // Extension comes from the validated MIME, never from the uploader. See EXTENSION_FOR_MIME.
    const ext =
      EXTENSION_FOR_MIME[file.mimetype.toLowerCase()] ?? FALLBACK_EXTENSION;
    // Step 2. The uuid makes collisions impossible even for identical filenames.
    const objectPath = `${groupId}/${randomUUID()}-${stem}.${ext}`;
    return this.configured
      ? this.uploadToSupabase(objectPath, file)
      : this.uploadToLocal(objectPath, file);
  }

  private async uploadToSupabase(
    objectPath: string,
    file: UploadedFileLike,
  ): Promise<StoredFile> {
    // Trailing slash stripped so the joined URL never contains a double slash.
    const root = this.config
      .getOrThrow<string>('SUPABASE_URL')
      .replace(/\/$/, '');
    // Server-side only — this key must never reach the browser.
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_KEY');
    const endpoint = `${root}/storage/v1/object/${this.bucket}/${encodeURI(objectPath)}`;

    // Step 4. Plain fetch, no SDK — the whole contract is these few lines.
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': file.mimetype || 'application/octet-stream',
        'cache-control': '3600',
        // Refuses to overwrite: the uuid makes a collision a bug worth surfacing.
        'x-upsert': 'false',
      },
      // A Node Buffer isn't a valid BodyInit in the DOM fetch types; wrap it as a Uint8Array view.
      body: new Uint8Array(file.buffer),
    });

    if (!res.ok) {
      // The upstream detail is logged but never returned — it can carry bucket internals.
      const detail = await res.text().catch(() => '');
      this.logger.error(
        `Supabase upload failed (${res.status} ${res.statusText}): ${detail}`,
      );
      // 503, so the client can distinguish "storage is down" from "your file was rejected".
      throw new ServiceUnavailableException('Upload failed');
    }

    return {
      // The public URL is deterministic, so no second round-trip is needed to learn it.
      url: `${root}/storage/v1/object/public/${this.bucket}/${encodeURI(objectPath)}`,
      // The ORIGINAL name is kept for display; only the STORED name was sanitised.
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
    // Step 5. recursive so the per-group directory is created on first upload.
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
    // Static so main.ts can call it without instantiating the service.
    return join(process.cwd(), 'uploads');
  }
}
