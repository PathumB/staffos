import { describe, expect, it } from 'vitest';
import {
  clientInputSchema,
  clientUpdateSchema,
  formatFils,
  manpowerRequestInputSchema,
  manpowerRequestUpdateSchema,
} from './crm.js';

const request = {
  roleTitle: 'Heavy Vehicle Driver',
  category: 'DRIVER',
  headcount: 10,
  location: 'Jebel Ali',
  emirate: 'DUBAI',
  startDate: '2026-11-01',
};

describe('CRM schemas', () => {
  it('applies client defaults on create but never on update', () => {
    const base = { name: 'Gulf Build', industry: 'CONSTRUCTION', city: 'Dubai', emirate: 'DUBAI' };
    expect(clientInputSchema.parse(base)).toMatchObject({
      vatRateBps: 500,
      paymentTermsDays: 30,
      status: 'ACTIVE',
    });
    expect(clientUpdateSchema.parse({ name: 'New name' })).toEqual({ name: 'New name' });
  });

  it('validates the TRN format and treats an empty TRN as absent', () => {
    const base = { name: 'X', industry: 'OTHER', city: 'Dubai', emirate: 'DUBAI' };
    expect(clientInputSchema.safeParse({ ...base, trn: '12345' }).success).toBe(false);
    expect(clientInputSchema.parse({ ...base, trn: '' }).trn).toBeUndefined();
    expect(clientInputSchema.parse({ ...base, trn: '100000000000001' }).trn).toBe(
      '100000000000001',
    );
  });

  it('rejects headcount < 1, bad dates, inverted rate bands and unknown fields', () => {
    expect(manpowerRequestInputSchema.safeParse({ ...request, headcount: 0 }).success).toBe(false);
    expect(
      manpowerRequestInputSchema.safeParse({ ...request, startDate: '01/11/2026' }).success,
    ).toBe(false);
    expect(
      manpowerRequestInputSchema.safeParse({
        ...request,
        billRateMinFils: 5000,
        billRateMaxFils: 4000,
      }).success,
    ).toBe(false);
    expect(manpowerRequestInputSchema.safeParse({ ...request, status: 'APPROVED' }).success).toBe(
      false,
    );
    expect(manpowerRequestInputSchema.safeParse(request).success).toBe(true);
  });

  it('requires a version on updates', () => {
    expect(manpowerRequestUpdateSchema.safeParse({ headcount: 5 }).success).toBe(false);
    expect(manpowerRequestUpdateSchema.parse({ headcount: 5, version: 2 })).toEqual({
      headcount: 5,
      version: 2,
    });
  });

  it('formats integer fils as AED', () => {
    expect(formatFils(123450)).toBe('AED 1,234.50');
    expect(formatFils(null)).toBe('—');
  });
});
