-- Keep migrate-only environments aligned with the code-owned permission catalog.
-- Manual Refund V2 was deployed without seeding these permissions onto the
-- shared system roles, which prevented tenant owners from creating maker and
-- checker roles even after the tenant feature was enabled.

INSERT INTO "permissions" ("key", "scope_level") VALUES
  ('platform.refunds.break_glass', 'platform'),
  ('tenant.refunds.prepare', 'tenant'),
  ('tenant.refunds.approve', 'tenant'),
  ('tenant.refunds.reveal', 'tenant')
ON CONFLICT ("key") DO UPDATE SET "scope_level" = EXCLUDED."scope_level";

INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, x.permission_key
FROM "roles" r
CROSS JOIN LATERAL (
  SELECT unnest(CASE
    WHEN r.name = 'Super Admin' AND r.scope_level = 'platform'
      THEN ARRAY['platform.refunds.break_glass']
    WHEN r.name IN ('Tenant Owner', 'Manager') AND r.scope_level = 'tenant'
      THEN ARRAY['tenant.refunds.prepare', 'tenant.refunds.approve', 'tenant.refunds.reveal']
    WHEN r.name = 'Finance' AND r.scope_level = 'tenant'
      THEN ARRAY['tenant.refunds.prepare', 'tenant.refunds.approve', 'tenant.refunds.reveal']
    ELSE ARRAY[]::text[]
  END) AS permission_key
) x
WHERE r.is_system = true
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
