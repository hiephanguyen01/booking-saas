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

export interface ICommissionRuleRepository {
  /** All rules for the current tenant (RLS-scoped) — precedence resolved in the domain. */
  list(tx: PrismaTx): Promise<CommissionRuleRecord[]>;
  findById(tx: PrismaTx, id: string): Promise<CommissionRuleRecord | null>;
  create(tx: PrismaTx, tenantId: string, data: CreateCommissionRuleData): Promise<CommissionRuleRecord>;
  update(tx: PrismaTx, id: string, data: UpdateCommissionRuleData): Promise<CommissionRuleRecord>;
  /** Platform-admin-only path — only the platform fee % changes. */
  setPlatformRate(tx: PrismaTx, id: string, platformRate: number): Promise<CommissionRuleRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
}
