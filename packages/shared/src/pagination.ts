import { z } from 'zod';

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/**
 * Base list query (api-contract.md §1.2). Modules extend it with their own
 * whitelisted `sort` fields and `filter[...]` keys.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  sort: z
    .string()
    .regex(
      /^-?[a-zA-Z]+(,-?[a-zA-Z]+)*$/,
      'sort must be comma-separated field names, optionally prefixed with -',
    )
    .default('-createdAt'),
  search: z.string().trim().max(100).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export type PageMeta = { page: number; pageSize: number; total: number };

export type Paginated<T> = { data: T[]; meta: PageMeta };

/** Parses `-createdAt,lastName` into Prisma-style orderBy entries. */
export function parseSort(sort: string): { field: string; direction: 'asc' | 'desc' }[] {
  return sort
    .split(',')
    .map((part) =>
      part.startsWith('-')
        ? { field: part.slice(1), direction: 'desc' as const }
        : { field: part, direction: 'asc' as const },
    );
}
