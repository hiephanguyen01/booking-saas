import type { RateType } from '../../../../shared/domain/commission/commission-split';
import { violatesTenantShareFloor } from '../../../../shared/domain/commission/commission-rate-guard';
import {
  AffiliateTenantShareFloorViolated,
  TenantInactive,
} from '../errors/affiliate-errors';

export type AffiliateStatus = 'pending' | 'approved' | 'suspended';
export type AffiliateStatusWrite = 'approved' | 'suspended';

/** The narrow persisted state owned by the Affiliate aggregate. */
export interface AffiliateState {
  id: string;
  tenantId: string;
  userId: string;
  status: AffiliateStatus;
  /** Whole-percent override; null means the tenant-default rule applies. */
  customRate: bigint | null;
  /** Legacy jsonb. Rehydrate must never validate or reshape this value. */
  payoutInfo: unknown;
  createdAt: Date;
}

/** Validated insert payload (id/createdAt assigned by the DB). */
export interface NewAffiliate {
  tenantId: string;
  userId: string;
  status: 'pending';
  customRate: null;
  payoutInfo: unknown;
}

/** The tenant-default facts needed by the custom-rate floor check. */
export interface AffiliateTenantShareRule {
  tenantRateType: RateType;
  tenantRate: bigint;
  platformRate: number;
}

/** Unconditional status write + matching frozen outbox event intent. */
export interface AffiliateStatusIntent {
  status: AffiliateStatusWrite;
  eventType: 'affiliate.approved' | 'affiliate.suspended';
}

/** Column-granular custom-rate write intent. */
export interface AffiliateCustomRateIntent {
  customRate: bigint | null;
}

/** Whole-object payout replacement intent. */
export interface AffiliatePayoutInfoIntent {
  payoutInfo: Record<string, unknown>;
}

/**
 * One user's affiliate membership in one tenant.
 *
 * Known gap preserved intentionally: there is no status transition graph.
 * Any prior state, including the requested same state, may be written to
 * `approved` or `suspended` and must still emit the matching event.
 *
 * Framework-free: no Nest, Prisma, or zod imports.
 */
export class Affiliate {
  private constructor(private state: AffiliateState) {}

  /** Rehydrate without validating legacy payout json or tightening old rows. */
  static rehydrate(state: AffiliateState): Affiliate {
    return new Affiliate(state);
  }

  /**
   * Build a new application before any tenant-scoped transaction is opened.
   * The inactive check deliberately precedes the idempotent membership lookup:
   * an inactive tenant rejects even a re-application.
   */
  static apply(input: {
    tenantId: string;
    userId: string;
    payoutInfo: unknown;
    tenantStatus: string;
  }): NewAffiliate {
    if (input.tenantStatus !== 'active') throw new TenantInactive();
    return {
      tenantId: input.tenantId,
      userId: input.userId,
      status: 'pending',
      customRate: null,
      payoutInfo: input.payoutInfo,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get tenantId(): string {
    return this.state.tenantId;
  }

  get userId(): string {
    return this.state.userId;
  }

  get status(): AffiliateStatus {
    return this.state.status;
  }

  get customRate(): bigint | null {
    return this.state.customRate;
  }

  /**
   * Queue the same unconditional status write/event as the legacy use-case.
   * No previous-state check is added: any→requested and same→same are valid.
   */
  setStatus(status: AffiliateStatusWrite): AffiliateStatusIntent {
    this.state = { ...this.state, status };
    return {
      status,
      eventType:
        status === 'approved' ? 'affiliate.approved' : 'affiliate.suspended',
    };
  }

  /**
   * Set or clear the whole-percent override. The comparison is meaningful only
   * when a tenant-default rule exists and its tenant leg is percent-based;
   * null/no-rule/fixed-rate behavior remains deliberately permissive.
   *
   * There is intentionally no hidden `customRate <= 100` validation.
   */
  setCustomRate(
    customRate: bigint | null,
    rule: AffiliateTenantShareRule | null,
  ): AffiliateCustomRateIntent {
    if (
      customRate !== null &&
      rule !== null &&
      violatesTenantShareFloor({
        tenantRateType: rule.tenantRateType,
        tenantRate: rule.tenantRate,
        platformRate: rule.platformRate,
        affiliateRateType: 'percent',
        affiliateRate: customRate,
        isHouse: false,
      })
    ) {
      throw new AffiliateTenantShareFloorViolated();
    }

    this.state = { ...this.state, customRate };
    return { customRate };
  }

  /**
   * Build a whole-object replacement without rehydrating an Affiliate. The
   * existing path performs no pre-read, and adding one would change its query
   * and not-found behavior.
   */
  static replacePayoutInfo(
    input: Record<string, unknown>,
  ): AffiliatePayoutInfoIntent {
    return { payoutInfo: { ...input } };
  }
}
