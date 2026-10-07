import { redact } from './audit.service';

describe('redact', () => {
  it('masks secrets at any depth and serialises dates', () => {
    const out = redact({
      email: 'a@b.co',
      passwordHash: '$argon2id$…',
      nested: { refreshToken: 'abc', items: [{ apiSecret: 's', ok: 1 }] },
      at: new Date('2026-10-07T00:00:00.000Z'),
    });
    expect(out).toEqual({
      email: 'a@b.co',
      passwordHash: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', items: [{ apiSecret: '[REDACTED]', ok: 1 }] },
      at: '2026-10-07T00:00:00.000Z',
    });
  });
});
