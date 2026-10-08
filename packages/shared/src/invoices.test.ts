import { describe, expect, it } from 'vitest';
import { lineAmountFils, vatFils } from './invoices.js';

describe('invoice maths (integer fils, half-up)', () => {
  it('prices minutes at an hourly rate', () => {
    expect(lineAmountFils(480, 4_500)).toBe(36_000); // 8 h × AED 45
    expect(lineAmountFils(1, 4_500)).toBe(75);
    expect(lineAmountFils(1, 4_510)).toBe(75); // 75.1666… → 75
    expect(lineAmountFils(1, 4_530)).toBe(76); // 75.5 → 76 (half-up)
    expect(lineAmountFils(0, 4_500)).toBe(0);
  });

  it('adds VAT in basis points', () => {
    expect(vatFils(36_000, 500)).toBe(1_800); // 5%
    expect(vatFils(10_010, 500)).toBe(501); // 500.5 → 501
    expect(vatFils(10_009, 500)).toBe(500); // 500.45 → 500
    expect(vatFils(36_000, 0)).toBe(0); // zero-rated
  });
});
