import type { ApplicationStage } from '@staffos/shared';
import {
  assertJobEditable,
  assertStageTransition,
  daysBetween,
  jobSlug,
  nextJobStatus,
} from './application.rules';

describe('application stage rules', () => {
  it.each<[ApplicationStage, ApplicationStage]>([
    ['APPLIED', 'SCREENING'],
    ['SCREENING', 'SHORTLISTED'],
    ['SHORTLISTED', 'INTERVIEW'],
    ['INTERVIEW', 'OFFER'],
    ['OFFER', 'HIRED'],
    ['APPLIED', 'REJECTED'],
    ['INTERVIEW', 'WITHDRAWN'],
  ])('allows %s → %s', (from, to) => {
    expect(() => assertStageTransition(from, to)).not.toThrow();
  });

  it.each<[ApplicationStage, ApplicationStage]>([
    ['APPLIED', 'HIRED'],
    ['APPLIED', 'SHORTLISTED'],
    ['INTERVIEW', 'SCREENING'],
    ['HIRED', 'REJECTED'],
    ['REJECTED', 'SCREENING'],
    ['WITHDRAWN', 'APPLIED'],
  ])('rejects %s → %s with 409 INVALID_TRANSITION', (from, to) => {
    expect(() => assertStageTransition(from, to)).toThrow(
      expect.objectContaining({
        code: 'INVALID_TRANSITION',
        details: expect.objectContaining({ from, to }),
      }),
    );
  });
});

describe('job lifecycle', () => {
  it('publishes drafts and held jobs, holds open ones, closes any active job', () => {
    expect(nextJobStatus('DRAFT', 'publish')).toBe('OPEN');
    expect(nextJobStatus('ON_HOLD', 'publish')).toBe('OPEN');
    expect(nextJobStatus('OPEN', 'hold')).toBe('ON_HOLD');
    expect(nextJobStatus('OPEN', 'close')).toBe('CLOSED');
  });

  it.each([
    ['OPEN', 'publish'],
    ['DRAFT', 'hold'],
    ['CLOSED', 'publish'],
    ['FILLED', 'close'],
  ] as const)('rejects %s → %s', (from, action) => {
    expect(() => nextJobStatus(from, action)).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });

  it('locks closed and filled jobs', () => {
    expect(() => assertJobEditable('CLOSED')).toThrow();
    expect(() => assertJobEditable('FILLED')).toThrow();
    expect(() => assertJobEditable('OPEN')).not.toThrow();
  });
});

describe('helpers', () => {
  it('builds URL-safe slugs', () => {
    expect(jobSlug('Heavy Vehicle Driver (Class 3)', 'a1b2c3')).toBe(
      'heavy-vehicle-driver-class-3-a1b2c3',
    );
    expect(jobSlug('¡¿!!', 'x')).toBe('job-x');
  });

  it('counts whole days in stage', () => {
    expect(daysBetween(new Date('2026-10-01T10:00:00Z'), new Date('2026-10-04T09:00:00Z'))).toBe(2);
    expect(daysBetween(new Date('2026-10-05T00:00:00Z'), new Date('2026-10-04T00:00:00Z'))).toBe(0);
  });
});
