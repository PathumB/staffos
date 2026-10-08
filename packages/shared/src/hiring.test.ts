import { describe, expect, it } from 'vitest';
import {
  feedbackInputSchema,
  interviewCreateSchema,
  nextOfferStatus,
  offerCreateSchema,
} from './hiring.js';

const uuid = '0190a000-0000-7000-8000-000000000001';

describe('nextOfferStatus', () => {
  it('follows the documented lifecycle', () => {
    expect(nextOfferStatus('PENDING_APPROVAL', 'approve')).toBe('APPROVED');
    expect(nextOfferStatus('PENDING_APPROVAL', 'reject')).toBe('REJECTED');
    expect(nextOfferStatus('APPROVED', 'send')).toBe('SENT');
    expect(nextOfferStatus('SENT', 'accept')).toBe('ACCEPTED');
    expect(nextOfferStatus('SENT', 'decline')).toBe('DECLINED');
  });

  it('refuses skipped steps and actions on terminal offers', () => {
    expect(nextOfferStatus('PENDING_APPROVAL', 'send')).toBeNull();
    expect(nextOfferStatus('APPROVED', 'accept')).toBeNull();
    expect(nextOfferStatus('ACCEPTED', 'withdraw')).toBeNull();
    expect(nextOfferStatus('DECLINED', 'approve')).toBeNull();
  });

  it('allows withdrawing any open offer', () => {
    for (const s of ['PENDING_APPROVAL', 'APPROVED', 'SENT'] as const) {
      expect(nextOfferStatus(s, 'withdraw')).toBe('WITHDRAWN');
    }
  });
});

describe('offerCreateSchema', () => {
  const base = {
    applicationId: uuid,
    salaryFils: 450_000,
    startDate: '2027-01-10',
    contractType: 'PERMANENT' as const,
  };

  it('defaults the currency to AED', () => {
    expect(offerCreateSchema.parse(base).currency).toBe('AED');
  });

  it('requires a length for fixed-term contracts and forbids one for permanent', () => {
    expect(offerCreateSchema.safeParse({ ...base, contractType: 'FIXED_TERM' }).success).toBe(
      false,
    );
    expect(
      offerCreateSchema.safeParse({ ...base, contractType: 'FIXED_TERM', contractMonths: 12 })
        .success,
    ).toBe(true);
    expect(offerCreateSchema.safeParse({ ...base, contractMonths: 12 }).success).toBe(false);
  });
});

describe('interviewCreateSchema', () => {
  const base = {
    applicationId: uuid,
    scheduledAt: '2027-01-10T10:00:00+04:00',
    durationMin: 45,
    mode: 'VIDEO' as const,
    interviewerIds: [uuid],
  };

  it('needs a location for on-site interviews', () => {
    expect(interviewCreateSchema.safeParse({ ...base, mode: 'ONSITE' }).success).toBe(false);
    expect(
      interviewCreateSchema.safeParse({ ...base, mode: 'ONSITE', location: 'Al Quoz office' })
        .success,
    ).toBe(true);
  });

  it('rejects duplicate interviewers and non-http meeting links', () => {
    expect(interviewCreateSchema.safeParse({ ...base, interviewerIds: [uuid, uuid] }).success).toBe(
      false,
    );
    expect(
      interviewCreateSchema.safeParse({ ...base, meetingUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });
});

describe('feedbackInputSchema', () => {
  it('keeps scores between 1 and 5 with unique criteria', () => {
    const ok = { scores: [{ criterion: 'Communication', score: 4 }], recommendation: 'YES' };
    expect(feedbackInputSchema.safeParse(ok).success).toBe(true);
    expect(
      feedbackInputSchema.safeParse({ ...ok, scores: [{ criterion: 'Communication', score: 6 }] })
        .success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({
        ...ok,
        scores: [
          { criterion: 'Communication', score: 4 },
          { criterion: 'communication', score: 3 },
        ],
      }).success,
    ).toBe(false);
  });
});
