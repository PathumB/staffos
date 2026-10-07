/**
 * Seed entry point (CLAUDE.md §9): fictional UAE staffing companies and people only.
 * The implementation lives in apps/api/src/seed so it can use the API's dependencies.
 * Run with `pnpm db:seed`.
 */
import { runSeed } from '../apps/api/src/seed/main';

runSeed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
