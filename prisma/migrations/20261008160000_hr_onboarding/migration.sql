-- HR core and notifications.

-- Optimistic locking for employee edits (HR and the employee can both edit a record).
ALTER TABLE "employees" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Notification email outbox: written in the business transaction, sent by a scheduled job.
ALTER TABLE "notifications"
  ADD COLUMN "send_email" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailed_at" TIMESTAMPTZ(3);
CREATE INDEX "notifications_send_email_emailed_at_idx" ON "notifications"("send_email", "emailed_at");
