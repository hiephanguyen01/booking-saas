ALTER TABLE "manual_refund_operations"
  ADD COLUMN "customer_detail_reminder_24_at" TIMESTAMPTZ(6),
  ADD COLUMN "customer_detail_reminder_48_at" TIMESTAMPTZ(6),
  ADD COLUMN "checker_waiting_at" TIMESTAMPTZ(6),
  ADD COLUMN "checker_escalated_at" TIMESTAMPTZ(6);

CREATE INDEX "manual_refund_operations_customer_detail_reminders_idx"
  ON "manual_refund_operations"("status", "created_at", "customer_detail_reminder_24_at", "customer_detail_reminder_48_at");
CREATE INDEX "manual_refund_operations_checker_escalation_idx"
  ON "manual_refund_operations"("status", "transfer_submitted_at", "checker_escalated_at");
