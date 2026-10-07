import { describe, expect, it } from 'vitest';
import { listQuerySchema, PAGE_SIZE_MAX, parseSort } from './pagination.js';

describe('listQuerySchema', () => {
  it('applies defaults', () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, sort: '-createdAt' });
  });

  it('coerces query-string numbers', () => {
    expect(listQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it.each([{ page: 0 }, { pageSize: PAGE_SIZE_MAX + 1 }, { pageSize: 0 }, { sort: 'name;drop' }])(
    'rejects %o',
    (input) => {
      expect(listQuerySchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('parseSort', () => {
  it('parses direction prefixes', () => {
    expect(parseSort('-createdAt,lastName')).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'lastName', direction: 'asc' },
    ]);
  });
});
