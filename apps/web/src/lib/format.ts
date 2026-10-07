// Times are stored in UTC and shown in UAE time (docs/01-PRD.md §7).
const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

/** `{ page: 2, filter: { status: 'ACTIVE' } }` → `page=2&filter[status]=ACTIVE` (skips empty values). */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined && v !== null && v !== '') search.set(`${key}[${k}]`, String(v));
      }
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}
