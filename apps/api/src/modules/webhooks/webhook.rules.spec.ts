import { createHmac } from 'node:crypto';
import { isPrivateAddress, nextDeliveryState, SecretBox, signBody } from './webhook.rules';

describe('webhook rules (US-HOOK-01)', () => {
  it('signs the exact body as sha256=<hex hmac>', () => {
    const body = '{"event":"employee.hired"}';
    const expected = createHmac('sha256', 'whsec_test').update(body).digest('hex');
    expect(signBody('whsec_test', body)).toBe(`sha256=${expected}`);
    expect(signBody('whsec_test', `${body} `)).not.toBe(`sha256=${expected}`);
  });

  it('encrypts secrets at rest and detects tampering', () => {
    const box = new SecretBox('x'.repeat(32));
    const sealed = box.seal('whsec_abc');
    expect(sealed).not.toContain('whsec_abc');
    expect(box.open(sealed)).toBe('whsec_abc');
    const parts = sealed.split(':');
    parts[3] = Buffer.from('forged').toString('base64url');
    expect(() => box.open(parts.join(':'))).toThrow();
    expect(() => new SecretBox('y'.repeat(32)).open(sealed)).toThrow();
  });

  it('flags internal addresses (SSRF guard)', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it('retries with backoff and gives up after 5 attempts', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    expect(nextDeliveryState({ ok: true, attempts: 1, now }).status).toBe('SUCCEEDED');
    const retry = nextDeliveryState({ ok: false, attempts: 1, now });
    expect(retry.status).toBe('PENDING');
    expect(retry.nextAttemptAt?.getTime()).toBe(now.getTime() + 30_000);
    expect(nextDeliveryState({ ok: false, attempts: 4, now }).nextAttemptAt?.getTime()).toBe(
      now.getTime() + 240_000,
    );
    expect(nextDeliveryState({ ok: false, attempts: 5, now })).toEqual({
      status: 'FAILED',
      nextAttemptAt: null,
    });
  });
});
