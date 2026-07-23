import {
  ReferralLinkNotOwned,
  ReferralListingRequired,
} from '../errors/affiliate-errors';

export type ReferralTarget = 'tenant_home' | 'listing';

/** The narrow persisted state owned by ReferralLink. */
export interface ReferralLinkState {
  id: string;
  tenantId: string;
  affiliateId: string;
  code: string;
  target: ReferralTarget;
  listingId: string | null;
  clicksCount: number;
  createdAt: Date;
}

/** Input shape shared by boundary prevalidation and the factory. */
export interface ReferralTargetInput {
  target: ReferralTarget;
  listingId?: string | null;
}

/** Validated insert payload (id/click counter/createdAt assigned by the DB). */
export interface NewReferralLink {
  tenantId: string;
  affiliateId: string;
  code: string;
  target: ReferralTarget;
  listingId: string | null;
}

/**
 * One affiliate-owned referral destination.
 *
 * Uniqueness, listing visibility/existence, affiliate approval, click logging,
 * and atomic counters remain outside this aggregate.
 *
 * Framework-free: no Nest, Prisma, node:crypto, or zod imports.
 */
export class ReferralLink {
  private constructor(private readonly state: ReferralLinkState) {}

  /** Rehydrate the narrow write state without validating historical rows. */
  static rehydrate(state: ReferralLinkState): ReferralLink {
    return new ReferralLink(state);
  }

  /**
   * Boundary-safe target check. The create use-case calls this before entering
   * `forTenant`, preserving the legacy error position for direct callers.
   */
  static prevalidateTarget(input: ReferralTargetInput): void {
    if (input.target === 'listing' && !input.listingId) {
      throw new ReferralListingRequired();
    }
  }

  /**
   * Build a consistent link. Calling the prevalidation here too means the
   * factory cannot produce an invalid listing target, while tenant-home always
   * discards any supplied listing id.
   */
  static open(
    input: {
      tenantId: string;
      affiliateId: string;
      code: string;
    } & ReferralTargetInput,
  ): NewReferralLink {
    ReferralLink.prevalidateTarget(input);
    return {
      tenantId: input.tenantId,
      affiliateId: input.affiliateId,
      code: input.code,
      target: input.target,
      listingId: input.target === 'listing' ? (input.listingId ?? null) : null,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get affiliateId(): string {
    return this.state.affiliateId;
  }

  /** RLS scopes the tenant; this enforces ownership within that tenant. */
  assertOwnedBy(affiliateId: string): void {
    if (this.state.affiliateId !== affiliateId) {
      throw new ReferralLinkNotOwned();
    }
  }
}
