import { type Paginated, parseSort } from '@staffos/shared';

/** Prisma skip/take from validated page params (api-contract.md §1.2). */
export function toSkipTake(query: { page: number; pageSize: number }): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/**
 * Converts a whitelisted `sort` string into a Prisma orderBy array. `id` is appended as a
 * tie-breaker so pagination is stable when sort values repeat.
 */
export function toOrderBy(sort: string): Record<string, 'asc' | 'desc'>[] {
  return [
    ...parseSort(sort).map(({ field, direction }) => ({ [field]: direction })),
    { id: 'asc' },
  ];
}

export function paginated<T>(
  data: T[],
  total: number,
  query: { page: number; pageSize: number },
): Paginated<T> {
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}
