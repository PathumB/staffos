import * as shared from '@staffos/shared';
import * as prismaEnums from '../generated/prisma/enums';

/**
 * packages/shared mirrors the database enums for the web app. If a migration adds or renames
 * an enum value, this fails until packages/shared/src/enums.ts is updated too.
 */
describe('shared enums match the Prisma schema', () => {
  const prismaEntries = Object.entries(prismaEnums).filter(
    ([, value]) => typeof value === 'object' && value !== null,
  );

  it('covers every Prisma enum', () => {
    expect(prismaEntries.length).toBeGreaterThan(0);
    const missing = prismaEntries.map(([name]) => name).filter((name) => !(name in shared));
    expect(missing).toEqual([]);
  });

  it.each(prismaEntries)('%s has identical values', (name, values) => {
    expect((shared as Record<string, unknown>)[name]).toEqual(values);
  });
});
