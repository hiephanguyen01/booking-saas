import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { CommissionRuleCandidate } from '../commission-rule-precedence';

export const COMMISSION_RULE_REPOSITORY = Symbol('COMMISSION_RULE_REPOSITORY');

export interface CommissionRuleRecord extends CommissionRuleCandidate {
  tenantId: string;
  createdAt: Date;
}

export interface CreateCommissionRuleData {
  appliesTo: 'tenant_default' | 'listing_type' | 'category' | 'partner';
  listingTypeId: string | null;
  categoryId: string | null;
  partnerId: string | null;
  tenantRateType: 'percent' | 'fixed';
  tenantRate: bigint;
  /** Platform fee %, seeded from the tenant default (platform-admin-only to change). */
  platformRate: number;
  affiliateRateType: 'percent' | 'fixed';
  affiliateRate: bigint;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

export type UpdateCommissionRuleData = Partial<CreateCommissionRuleData>;

export interface IncompatibleDepositCoverage {
  count: number;
  samples: Array<{ id: string; title: string; depositPercent: number; requiredPercent: number }>;
}

export interface ICommissionRuleRepository {
  /** All rules for the current tenant (RLS-scoped) — precedence resolved in the domain. */
  list(tx: PrismaTx): Promise<CommissionRuleRecord[]>;
  /** Set the platform fee on every rule of the current tenant (RLS-scoped). */
  updatePlatformRateForTenant(tx: PrismaTx, platformRate: number): Promise<number>;
  findById(tx: PrismaTx, id: string): Promise<CommissionRuleRecord | null>;
  findIncompatibleListingsForRule(
    tx: PrismaTx,
    data: CreateCommissionRuleData,
    excludeRuleId?: string,
  ): Promise<IncompatibleDepositCoverage>;
  create(
    tx: PrismaTx,
    tenantId: string,
    data: CreateCommissionRuleData,
  ): Promise<CommissionRuleRecord>;
  update(tx: PrismaTx, id: string, data: UpdateCommissionRuleData): Promise<CommissionRuleRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
}
