import type { ManpowerRequestStatus } from '@staffos/shared';
import {
  ALLOWED_FROM,
  assertTransition,
  type ManpowerRequestAction,
  statusAfterSubmit,
} from './manpower-request.rules';

const ALL: ManpowerRequestStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'FULFILLED',
  'CANCELLED',
];

describe('manpower request rules', () => {
  it.each([
    [20, 'APPROVED'],
    [21, 'PENDING_APPROVAL'],
    [1, 'APPROVED'],
  ] as const)('headcount %i with threshold 20 → %s', (headcount, expected) => {
    expect(statusAfterSubmit(headcount, 20)).toBe(expected);
  });

  it('uses the configured threshold', () => {
    expect(statusAfterSubmit(10, 5)).toBe('PENDING_APPROVAL');
  });

  const cases = (Object.keys(ALLOWED_FROM) as ManpowerRequestAction[]).flatMap((action) =>
    ALL.map((status) => [action, status, ALLOWED_FROM[action].includes(status)] as const),
  );

  it.each(cases)('%s from %s allowed=%s', (action, status, allowed) => {
    if (allowed) {
      expect(() => assertTransition(status, action)).not.toThrow();
    } else {
      expect(() => assertTransition(status, action)).toThrow(
        expect.objectContaining({ code: 'INVALID_TRANSITION' }),
      );
    }
  });

  it('never allows changing a decided or closed request', () => {
    for (const status of ['REJECTED', 'FULFILLED', 'CANCELLED'] as const) {
      for (const action of Object.keys(ALLOWED_FROM) as ManpowerRequestAction[]) {
        expect(() => assertTransition(status, action)).toThrow();
      }
    }
  });
});
