-- Task 1.9 review fix: a webhook resolves its tenant from `gateway_txn_id` on the
-- admin pool, so the id must be unique per gateway (a cross-tenant collision would
-- resolve the wrong payment). Postgres treats NULLs as distinct, so unpaid rows
-- without a txn id are unaffected. Replaces the plain index.

DROP INDEX IF EXISTS "payments_gateway_txn_id_idx";
CREATE UNIQUE INDEX "payments_gateway_gateway_txn_id_key" ON "payments" ("gateway", "gateway_txn_id");
