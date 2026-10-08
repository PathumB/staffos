-- Recruitment part 2: hiring integrity (CLAUDE.md §9). Prisma ignores sequences and exclusion
-- constraints when diffing, so later `prisma migrate dev` runs leave them in place.

-- Employee numbers (EMP-001001, …) come from a sequence so concurrent hires never collide.
-- Starts above the range used by seed data.
CREATE SEQUENCE IF NOT EXISTS employee_number_seq START WITH 1001;

-- At most one open or accepted offer per application, even under concurrent requests.
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_one_active_per_application"
  EXCLUDE USING btree ("application_id" WITH =)
  WHERE ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED'));
