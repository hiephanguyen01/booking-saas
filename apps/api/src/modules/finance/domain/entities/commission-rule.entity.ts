import type { CreateCommissionRuleInput, UpdateCommissionRuleInput } from '@booking/contracts';
import { violatesTenantShareFloor } from '../../../../shared/domain/commission/commission-rate-guard';
import {
  CommissionExceedsPartnerDeposit,
  CommissionRatesNegativeTenant,
  DefaultCommissionRuleLocked,
} from '../errors/finance-domain-errors';
import type {
  CommissionRuleRecord,
  CreateCommissionRuleData,
  IncompatibleDepositCoverage,
  UpdateCommissionRuleData,
} from '../ports/commission-rule-repository.port';

export class CommissionRule {
  private constructor(private readonly state: CommissionRuleRecord) {}

  static create(
    input: CreateCommissionRuleInput,
    platformRate: number,
    isHouse: boolean,
  ): CreateCommissionRuleData {
    const data = {
      appliesTo: input.appliesTo,
      listingTypeId: input.listingTypeId ?? null,
      categoryId: input.categoryId ?? null,
      partnerId: input.partnerId ?? null,
      tenantRateType: input.tenantRateType,
      tenantRate: BigInt(input.tenantRate),
      platformRate,
      affiliateRateType: input.affiliateRateType,
      affiliateRate: BigInt(input.affiliateRate),
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
    } as const;
    this.assertTenantShare(data, isHouse);
    return data;
  }

  static rehydrate(state: CommissionRuleRecord): CommissionRule {
    return new CommissionRule(state);
  }

  static assertDepositCoverage(incompatible: IncompatibleDepositCoverage): void {
    if (incompatible.count > 0) throw new CommissionExceedsPartnerDeposit(incompatible);
  }

  targetAfter(input: UpdateCommissionRuleInput): {
    appliesTo: CommissionRuleRecord['appliesTo'];
    partnerId: string | null;
  } {
    return {
      appliesTo: input.appliesTo ?? this.state.appliesTo,
      partnerId: input.partnerId !== undefined ? (input.partnerId ?? null) : this.state.partnerId,
    };
  }

  proposeUpdate(
    input: UpdateCommissionRuleInput,
    isHouse: boolean,
  ): { candidate: CreateCommissionRuleData; patch: UpdateCommissionRuleData } {
    const target = this.targetAfter(input);
    const candidate: CreateCommissionRuleData = {
      appliesTo: target.appliesTo,
      listingTypeId:
        input.listingTypeId !== undefined
          ? (input.listingTypeId ?? null)
          : this.state.listingTypeId,
      categoryId:
        input.categoryId !== undefined ? (input.categoryId ?? null) : this.state.categoryId,
      partnerId: target.partnerId,
      tenantRateType: input.tenantRateType ?? this.state.tenantRateType,
      tenantRate: input.tenantRate !== undefined ? BigInt(input.tenantRate) : this.state.tenantRate,
      platformRate: this.state.platformRate,
      affiliateRateType: input.affiliateRateType ?? this.state.affiliateRateType,
      affiliateRate:
        input.affiliateRate !== undefined ? BigInt(input.affiliateRate) : this.state.affiliateRate,
      effectiveFrom:
        input.effectiveFrom !== undefined
          ? input.effectiveFrom
            ? new Date(input.effectiveFrom)
            : null
          : this.state.effectiveFrom,
      effectiveTo:
        input.effectiveTo !== undefined
          ? input.effectiveTo
            ? new Date(input.effectiveTo)
            : null
          : this.state.effectiveTo,
    };
    CommissionRule.assertTenantShare(candidate, isHouse);
    return { candidate, patch: toPartialData(input) };
  }

  withPlatformRate(platformRate: number, isHouse: boolean): number {
    CommissionRule.assertTenantShare({ ...this.state, platformRate }, isHouse);
    return platformRate;
  }

  assertDeletable(): void {
    if (this.state.appliesTo === 'tenant_default') throw new DefaultCommissionRuleLocked();
  }

  private static assertTenantShare(
    input: Pick<
      CreateCommissionRuleData,
      'tenantRateType' | 'tenantRate' | 'platformRate' | 'affiliateRateType' | 'affiliateRate'
    >,
    isHouse: boolean,
  ): void {
    if (violatesTenantShareFloor({ ...input, isHouse })) {
      throw new CommissionRatesNegativeTenant();
    }
  }
}

function toPartialData(input: UpdateCommissionRuleInput): UpdateCommissionRuleData {
  const data: UpdateCommissionRuleData = {};
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo;
  if (input.listingTypeId !== undefined) data.listingTypeId = input.listingTypeId ?? null;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId ?? null;
  if (input.partnerId !== undefined) data.partnerId = input.partnerId ?? null;
  if (input.tenantRateType !== undefined) data.tenantRateType = input.tenantRateType;
  if (input.tenantRate !== undefined) data.tenantRate = BigInt(input.tenantRate);
  if (input.affiliateRateType !== undefined) data.affiliateRateType = input.affiliateRateType;
  if (input.affiliateRate !== undefined) data.affiliateRate = BigInt(input.affiliateRate);
  if (input.effectiveFrom !== undefined) {
    data.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  }
  if (input.effectiveTo !== undefined) {
    data.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  }
  return data;
}
