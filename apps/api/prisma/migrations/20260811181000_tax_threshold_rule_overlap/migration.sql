-- Active legal-rule windows for the same code must never overlap. Superseded
-- rows remain queryable with is_active=false and are excluded from this guard.
ALTER TABLE "tax_threshold_rules"
  ADD CONSTRAINT "tax_threshold_rules_active_window_excl"
  EXCLUDE USING gist (
    "code" WITH =,
    tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&
  )
  WHERE ("is_active");
