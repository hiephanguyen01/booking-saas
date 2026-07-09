import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';

/**
 * Resolve whether a partner is a **house partner** (§7.3) inside the caller's
 * RLS-scoped tx. Used by the commission save guard to waive the
 * `platform% + affiliate% ≤ tenant%` floor for tenant-owned inventory.
 */
export async function isHousePartner(tx: PrismaTx, partnerId: string): Promise<boolean> {
  const partner = await tx.partner.findFirst({ where: { id: partnerId }, select: { isHouse: true } });
  return partner?.isHouse ?? false;
}
