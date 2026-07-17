import type { CancellationTier } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const CANCELLATION_POLICY_REPOSITORY = Symbol('CANCELLATION_POLICY_REPOSITORY');

export interface CancellationPolicyRecord {
  id: string;
  tenantId: string;
  /** null ⇒ tenant-level shared policy; set ⇒ owned by this partner. */
  partnerId: string | null;
  name: string;
  rules: CancellationTier[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCancellationPolicyData {
  partnerId: string;
  name: string;
  rules: CancellationTier[];
}

export interface UpdateCancellationPolicyData {
  name?: string;
  rules?: CancellationTier[];
}

export interface ICancellationPolicyRepository {
  /** Policies a partner may pick from: their own + tenant-level (partner_id null), by name. */
  listForPartner(tx: PrismaTx, partnerId: string): Promise<CancellationPolicyRecord[]>;
  /** Tenant-level shared policies only (partner_id null) — the tenant default picker. */
  listTenantLevel(tx: PrismaTx): Promise<CancellationPolicyRecord[]>;
  findById(tx: PrismaTx, id: string): Promise<CancellationPolicyRecord | null>;
  create(tx: PrismaTx, tenantId: string, data: CreateCancellationPolicyData): Promise<CancellationPolicyRecord>;
  update(tx: PrismaTx, id: string, data: UpdateCancellationPolicyData): Promise<CancellationPolicyRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  /** Listings whose OWN cancellationPolicyId points at this policy (delete guard). */
  countListingsUsing(tx: PrismaTx, id: string): Promise<number>;
  /** The caller partner's default policy id (for the isDefault flag); null when unset. */
  findPartnerDefaultId(tx: PrismaTx, partnerId: string): Promise<string | null>;
  /** The tenant's default policy id (for the isDefault flag); null when unset. */
  findTenantDefaultId(tx: PrismaTx, tenantId: string): Promise<string | null>;
}
