import { describe, expect, it } from 'vitest';
import { formatMinutes, mondayOf, timesheetCreateSchema, weekDates } from './workforce.js';

describe('week helpers', () => {
  it('finds the Monday of any day, including Sunday', () => {
    expect(mondayOf('2027-01-04')).toBe('2027-01-04'); // Monday
    expect(mondayOf('2027-01-07')).toBe('2027-01-04'); // Thursday
    expect(mondayOf('2027-01-10')).toBe('2027-01-04'); // Sunday
    expect(mondayOf('2027-01-01')).toBe('2026-12-28'); // across a year boundary
  });

  it('lists the seven days of a week', () => {
    expect(weekDates('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('formats minutes as hours', () => {
    expect(formatMinutes(480)).toBe('8h');
    expect(formatMinutes(510)).toBe('8h 30m');
  });

  it('caps a day at 16 hours and rejects duplicate days', () => {
    const base = { deploymentId: '0190a000-0000-7000-8000-000000000001', weekStart: '2027-01-04' };
    expect(
      timesheetCreateSchema.safeParse({ ...base, entries: [{ date: '2027-01-04', minutes: 961 }] })
        .success,
    ).toBe(false);
    expect(
      timesheetCreateSchema.safeParse({
        ...base,
        entries: [
          { date: '2027-01-04', minutes: 60 },
          { date: '2027-01-04', minutes: 60 },
        ],
      }).success,
    ).toBe(false);
  });
});
