-- call_webhook automation actions can forward any automation event to an endpoint.
ALTER TYPE "webhook_event" ADD VALUE IF NOT EXISTS 'DOCUMENT_EXPIRING';
ALTER TYPE "webhook_event" ADD VALUE IF NOT EXISTS 'TIMESHEET_SUBMITTED';
ALTER TYPE "webhook_event" ADD VALUE IF NOT EXISTS 'MANPOWER_REQUEST_CREATED';

-- Only one pending approval per manpower request / offer.
CREATE UNIQUE INDEX "approval_requests_one_pending_mr"
  ON "approval_requests" ("manpower_request_id") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "approval_requests_one_pending_offer"
  ON "approval_requests" ("offer_id") WHERE "status" = 'PENDING';
