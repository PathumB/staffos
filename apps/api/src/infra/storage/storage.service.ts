import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Env } from '../../common/config/env';

/**
 * Swappable private file storage (CLAUDE.md §3, security.md §3): files are never public; reads go
 * through short-lived signed URLs.
 */
export interface StorageProvider {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  /** A URL that works without a session for `ttlSeconds`. */
  signedUrl(key: string, ttlSeconds: number, downloadName: string): Promise<string>;
  delete(key: string): Promise<void>;
}

/** Keys are generated server-side ({owner}/{id}/{uuid}.{ext}); never accept them from users. */
const SAFE_KEY = /^[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx|jpg|png)$/;
const assertKey = (key: string) => {
  if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
};

/**
 * Development: files on local disk. "Signed" URLs point at the API's own download route with an
 * HMAC over the key and expiry, so they behave like the cloud provider's (expire, can't be forged).
 */
export class LocalDiskStorage implements StorageProvider {
  constructor(
    private readonly root: string,
    private readonly secret: string,
  ) {}

  async put(key: string, data: Buffer): Promise<void> {
    assertKey(key);
    const file = path.join(this.root, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async signedUrl(key: string, ttlSeconds: number, downloadName: string): Promise<string> {
    assertKey(key);
    const payload = Buffer.from(
      JSON.stringify({ k: key, n: downloadName, e: Math.floor(Date.now() / 1000) + ttlSeconds }),
    ).toString('base64url');
    // Relative: served same-origin through the web app's /api proxy (Vite in dev, Vercel rewrite).
    return `/api/v1/files/${payload}.${this.sign(payload)}`;
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await rm(path.join(this.root, key), { force: true });
  }

  /** Validates a token from `signedUrl`; returns the file or null when invalid/expired. */
  async read(token: string): Promise<{ data: Buffer; key: string; name: string } | null> {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    let claims: { k: string; n: string; e: number };
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (claims.e < Math.floor(Date.now() / 1000) || !SAFE_KEY.test(claims.k)) return null;
    try {
      return {
        data: await readFile(path.join(this.root, claims.k)),
        key: claims.k,
        name: claims.n,
      };
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(`storage-url:${payload}`).digest('base64url');
  }
}

/**
 * Production: a private Supabase Storage bucket through its REST API (free tier, no SDK). Signed
 * URLs are created by Supabase and expire on their side.
 */
export class SupabaseStorage implements StorageProvider {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  async put(key: string, data: Buffer, mimeType: string): Promise<void> {
    assertKey(key);
    await this.call(`/object/${this.bucket}/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, 'x-upsert': 'false' },
      body: new Uint8Array(data),
    });
  }

  async signedUrl(key: string, ttlSeconds: number, downloadName: string): Promise<string> {
    assertKey(key);
    const res = await this.call(`/object/sign/${this.bucket}/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    });
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${this.url}/storage/v1${signedURL}&download=${encodeURIComponent(downloadName)}`;
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.call(`/object/${this.bucket}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [key] }),
    });
  }

  private async call(pathname: string, init: RequestInit): Promise<Response> {
    const res = await fetch(`${this.url}/storage/v1${pathname}`, {
      ...init,
      headers: {
        ...init.headers,
        // New sb_secret_ keys go in `apikey`; legacy service_role JWTs also need the Bearer.
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Storage ${init.method} failed: ${res.status}`);
    return res;
  }
}

@Injectable()
export class StorageService {
  readonly provider: StorageProvider;

  constructor(
    config: ConfigService<Env, true>,
    @InjectPinoLogger(StorageService.name) logger: PinoLogger,
  ) {
    if (config.get('STORAGE_PROVIDER', { infer: true }) === 'supabase') {
      this.provider = new SupabaseStorage(
        config.get('SUPABASE_URL', { infer: true })!,
        config.get('SUPABASE_SERVICE_KEY', { infer: true })!,
        config.get('SUPABASE_BUCKET', { infer: true }),
      );
    } else {
      if (config.get('NODE_ENV', { infer: true }) === 'production') {
        logger.warn('Local file storage in production: uploads are lost when the server restarts.');
      }
      this.provider = new LocalDiskStorage(
        path.resolve(config.get('STORAGE_LOCAL_DIR', { infer: true })),
        config.get('JWT_ACCESS_SECRET', { infer: true }),
      );
    }
  }

  /** The local provider, when in use (for the download route). */
  get local(): LocalDiskStorage | null {
    return this.provider instanceof LocalDiskStorage ? this.provider : null;
  }
}
