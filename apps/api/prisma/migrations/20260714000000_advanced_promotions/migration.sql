-- Advanced promotions (Phase 2, §12): off-peak windows + partner-funding opt-in gate.
-- Columns only on the already-RLS-forced `promotions` table — no new RLS policy needed.

-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "funding_partner_id" UUID,
ADD COLUMN     "partner_opt_in_at" TIMESTAMPTZ(6),
ADD COLUMN     "time_windows" JSONB;

-- CreateIndex
CREATE INDEX "promotions_funding_partner_id_idx" ON "promotions"("funding_partner_id");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_funding_partner_id_fkey" FOREIGN KEY ("funding_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
