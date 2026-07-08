-- Custom-domain ownership verification (§6.1): the TXT value the tenant must
-- publish. Null for the default *.bookify.vn subdomain (auto-verified) and
-- cleared once verified.
ALTER TABLE "tenant_domains" ADD COLUMN "verification_token" TEXT;
