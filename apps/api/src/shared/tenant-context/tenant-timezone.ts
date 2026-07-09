import { DEFAULT_TIMEZONE } from '../time/time';
import type { PrismaTx } from './tenant-db.service';

/**
 * The tenant's configured `default_timezone` (§6.1) — the zone new resources
 * inherit when none is supplied. Read inside the caller's `forTenant` tx so it
 * commits atomically with the write; falls back to {@link DEFAULT_TIMEZONE} only
 * if the tenant row is somehow missing.
 */
export async function resolveTenantTimezone(tx: PrismaTx, tenantId: string): Promise<string> {
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultTimezone: true },
  });
  return tenant?.defaultTimezone ?? DEFAULT_TIMEZONE;
}
