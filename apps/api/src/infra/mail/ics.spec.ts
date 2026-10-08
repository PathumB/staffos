import { buildIcs, formatDubaiTime } from './ics';

const base = {
  uid: 'interview-1@staffos',
  sequence: 0,
  method: 'REQUEST' as const,
  start: new Date('2027-01-10T06:00:00Z'),
  durationMin: 45,
  summary: 'Interview: Site Electrician',
  description: 'Line one\nLine two; with, punctuation',
  location: 'Al Quoz, Dubai',
  organizer: { name: 'StaffOS', email: 'no-reply@staffos.demo' },
  attendee: { name: 'Omar "The" Haddad', email: 'omar@example.test' },
  now: new Date('2027-01-01T00:00:00Z'),
};

describe('buildIcs', () => {
  it('writes the times in Asia/Dubai (UTC+4)', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DTSTART;TZID=Asia/Dubai:20270110T100000');
    expect(ics).toContain('DTEND;TZID=Asia/Dubai:20270110T104500');
    expect(ics).toContain('TZOFFSETTO:+0400');
    expect(ics).toContain('DTSTAMP:20270101T000000Z');
  });

  it('escapes text and strips quotes from parameters', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two\\; with\\, punctuation');
    expect(ics).toContain('LOCATION:Al Quoz\\, Dubai');
    expect(ics).toContain('ATTENDEE;CN="Omar  The  Haddad"');
  });

  it('uses CRLF and folds long lines at 75 octets', () => {
    const ics = buildIcs({ ...base, description: 'é'.repeat(100) });
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(ics).toContain('\r\n é');
  });

  it('marks cancellations', () => {
    const ics = buildIcs({ ...base, method: 'CANCEL', sequence: 3 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:3');
  });
});

describe('formatDubaiTime', () => {
  it('shows the local Dubai time', () => {
    expect(formatDubaiTime(base.start)).toMatch(/10:00 \(Dubai time\)$/);
  });
});
