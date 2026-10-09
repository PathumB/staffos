import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { WEBHOOK_MAX_ATTEMPTS, webhookRetryDelayMs } from '@staffos/shared';

/** `X-StaffOS-Signature` value: HMAC-SHA256 of the exact request body with the endpoint secret. */
export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString('base64url')}`;

/**
 * Endpoint secrets are encrypted at rest (AES-256-GCM) with a key derived from the server secret,
 * so a database leak alone can't be used to forge signed deliveries.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(serverSecret: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', serverSecret, 'staffos', 'webhook-endpoint-secrets', 32),
    );
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join(':');
  }

  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(':');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable webhook secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/**
 * Loopback, private, link-local, CGNAT, multicast and other non-public ranges. Deliveries to
 * these are refused in production so a webhook can't be used to probe internal services (SSRF).
 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
  }
  return true; // not an IP at all: treat as unsafe
}

export type AttemptResult = { ok: boolean; attempts: number; now: Date };

/** After an attempt: delivered, retry later with backoff, or give up after 5 attempts. */
export function nextDeliveryState({ ok, attempts, now }: AttemptResult): {
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  nextAttemptAt: Date | null;
} {
  if (ok) return { status: 'SUCCEEDED', nextAttemptAt: null };
  if (attempts >= WEBHOOK_MAX_ATTEMPTS) return { status: 'FAILED', nextAttemptAt: null };
  return {
    status: 'PENDING',
    nextAttemptAt: new Date(now.getTime() + webhookRetryDelayMs(attempts)),
  };
}
