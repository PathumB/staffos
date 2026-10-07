import { Prisma } from '../../generated/prisma/client';

/** True when a unique constraint failed (optionally on a specific column). */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false;
  if (!field) return true;
  return JSON.stringify(error.meta ?? {}).includes(field);
}

export const personName = (u: { id: string; firstName: string; lastName: string } | null) =>
  u ? { id: u.id, name: `${u.firstName} ${u.lastName}` } : null;

export const userNameSelect = { select: { id: true, firstName: true, lastName: true } } as const;

/** Today's date in UAE time as YYYY-MM-DD (business dates are local, docs/01-PRD.md §7). */
export function todayInDubai(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(now);
}

export const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
export const fromDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
