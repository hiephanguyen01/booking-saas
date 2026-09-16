-- Relax check constraints on manual_refund_operations to support 1-step direct operator transfer

ALTER TABLE "manual_refund_operations"
  DROP CONSTRAINT "manual_refund_operations_transfer_state_prerequisites_check",
  ADD CONSTRAINT "manual_refund_operations_transfer_state_prerequisites_check" CHECK (
    "status" NOT IN ('transfer_submitted', 'transfer_rejected', 'completed')
    OR
    ("destination_submitted_at" IS NOT NULL
      AND "maker_user_id" IS NOT NULL
      AND "transfer_reference" IS NOT NULL
      AND "transfer_submitted_by_user_id" = "maker_user_id"
      AND "transfer_submitted_at" IS NOT NULL
      AND (
        ("evidence_object_key" IS NOT NULL AND "evidence_verified_at" IS NOT NULL)
        OR
        ("checked_at" IS NOT NULL)
      )
    )
  );

ALTER TABLE "manual_refund_operations"
  DROP CONSTRAINT "manual_refund_operations_completion_checker_check",
  ADD CONSTRAINT "manual_refund_operations_completion_checker_check" CHECK (
    "status" <> 'completed'
    OR
    (
      -- Standard 4-eyes maker-checker
      ("checked_by_user_id" IS NOT NULL AND "checked_at" IS NOT NULL AND "checked_by_user_id" <> "maker_user_id")
      OR
      -- Break-glass override
      ("break_glass_by_user_id" IS NOT NULL AND "break_glass_by_user_id" <> "maker_user_id")
      OR
      -- 1-Step Direct Operator Transfer
      ("checked_by_user_id" IS NOT NULL AND "checked_at" IS NOT NULL AND "checked_by_user_id" = "maker_user_id" AND "transfer_reference" IS NOT NULL)
    )
  );
