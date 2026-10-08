// Minimal RFC 5545 calendar invites, so interviews land in Outlook/Google/Apple calendars
// without a dependency. Times are written in Asia/Dubai (US-INT-01); the UAE has no daylight
// saving, so a fixed +04:00 VTIMEZONE is exact.

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

export type IcsEvent = {
  uid: string;
  /** Must increase on every change so calendars replace the earlier invite. */
  sequence: number;
  method: 'REQUEST' | 'CANCEL';
  start: Date;
  durationMin: number;
  summary: string;
  description: string;
  location?: string | null;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  now?: Date;
};

/** Escapes TEXT values (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Parameter values (CN) can't contain quotes or control characters; strip rather than escape. */
function paramValue(value: string): string {
  return `"${value.replace(/["\r\n\\;:,]/g, ' ').trim()}"`;
}

/** Folds lines longer than 75 octets (RFC 5545 §3.1), without splitting UTF-8 characters. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');

function dubaiLocal(date: Date): string {
  const d = new Date(date.getTime() + DUBAI_OFFSET_MS);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Formats a time for email bodies, e.g. "Sun, 10 Jan 2027, 10:00 (Dubai time)". */
export function formatDubaiTime(date: Date): string {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${text} (Dubai time)`;
}

export function buildIcs(event: IcsEvent): string {
  const end = new Date(event.start.getTime() + event.durationMin * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StaffOS//Interviews//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Dubai',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0400',
    'TZOFFSETTO:+0400',
    'TZNAME:+04',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utcStamp(event.now ?? new Date())}`,
    `DTSTART;TZID=Asia/Dubai:${dubaiLocal(event.start)}`,
    `DTEND;TZID=Asia/Dubai:${dubaiLocal(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    `ORGANIZER;CN=${paramValue(event.organizer.name)}:mailto:${event.organizer.email}`,
    `ATTENDEE;CN=${paramValue(event.attendee.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${event.attendee.email}`,
    `STATUS:${event.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
