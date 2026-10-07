/**
 * Seed script (CLAUDE.md §9): fictional UAE staffing companies and people only — no real personal data.
 * Data is added as modules land (target in docs/00-master-plan.md §5.5).
 * Run with `pnpm db:seed`.
 */
async function main(): Promise<void> {
  console.warn('No seed data yet: models are added module by module.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
