import type {
  PromoAppliesTo,
  PromoDiscountType,
  PromoFundedBy,
  PromoStatus,
  PromoTimeWindow,
} from '../promotion-discount';
import {
  PromotionAlreadyOptedIn,
  PromotionEnded,
  PromotionNotFundedByPartner,
  PromotionNotOwned,
} from '../errors/promotion-errors';

/** The persisted write-state the lifecycle paths need. */
export interface PromotionState {
  id: string;
  code: string | null;
  status: PromoStatus;
  discountType: PromoDiscountType;
  discountValue: bigint;
  fundedBy: PromoFundedBy;
  appliesTo: PromoAppliesTo;
  appliesToId: string | null;
  fundingPartnerId: string | null;
  partnerOptInAt: Date | null;
  createdByPartnerId: string | null;
}

/** Validated insert payload (id/redeemedCount/createdAt assigned by the DB). */
export interface NewPromotion {
  name: string;
  code: string | null;
  discountType: PromoDiscountType;
  discountValue: bigint;
  maxDiscount: bigint | null;
  fundedBy: PromoFundedBy;
  appliesTo: PromoAppliesTo;
  appliesToId: string | null;
  minOrderAmount: bigint | null;
  firstBookingOnly: boolean;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  timeWindows: PromoTimeWindow[] | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: 'draft' | 'active' | 'paused';
  createdByPartnerId: string | null;
  fundingPartnerId: string | null;
  partnerOptInAt: Date | null;
}

/** The diff to persist — only the keys actually being changed (tri-state preserved). */
export type PromotionPatch = Partial<NewPromotion>;

/** The funding fields a re-point writes — `partnerOptInAt` present only when the gate re-arms. */
export type FundingChange = Pick<
  PromotionPatch,
  'fundedBy' | 'fundingPartnerId' | 'partnerOptInAt'
>;

/** A scope the use-case already validated (target exists, is of the declared type). */
export interface ResolvedScope {
  appliesTo: PromoAppliesTo;
  /** Already normalized: `null` when `appliesTo === 'all'`. */
  appliesToId: string | null;
  /** Resolved owner for a partner-funded scope; `null` for tenant-funded. */
  fundingPartnerId: string | null;
}

/** The raw (contract-shaped) update payload — every field optional, `null` means clear. */
export interface PromotionUpdateInput {
  name?: string;
  discountType?: PromoDiscountType;
  discountValue?: bigint;
  maxDiscount?: bigint | null;
  minOrderAmount?: bigint | null;
  firstBookingOnly?: boolean;
  usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null;
  timeWindows?: PromoTimeWindow[] | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  status?: 'draft' | 'active' | 'paused';
}

/**
 * Promotion aggregate root (§12) — one promotion program: identity (code or auto
 * campaign), discount config, scope, funding + partner opt-in gate, limits, schedule
 * and lifecycle draft→active→paused→ended.
 *
 * Owns the write rules that used to be scattered across seven use-cases:
 *   - creation assembly, including the tenant-created vs partner-created defaults
 *     ({@link Promotion.open} / {@link Promotion.openForPartner});
 *   - the tri-state update merge (`undefined` = keep, `null` = clear, empty
 *     `timeWindows` array = clear) that was copy-pasted byte-for-byte into both the
 *     tenant and the partner update use-case — {@link Promotion.applyUpdate};
 *   - the edit/ownership/opt-in guards;
 *   - the rule that changing the funding partner re-arms the opt-in gate
 *     ({@link Promotion.resolveFundingChange}).
 *
 * NOT owned here (deliberately): anything needing I/O. Scope-target validity, the
 * funding partner behind a scope, the tenant-share risk verdict and code uniqueness
 * are resolved by the use-case through ports (RLS-scoped, inside the tx) and handed
 * in as facts. Usage claim/release and redemptions belong to PR #5b and are untouched.
 *
 * Framework-free: no Nest, no Prisma.
 */
export class Promotion {
  private constructor(private readonly state: PromotionState) {}

  /** Rehydrate for the update / end / opt-in paths. */
  static rehydrate(state: PromotionState): Promotion {
    return new Promotion(state);
  }

  /**
   * Assemble a tenant-created promotion. A tenant promotion is never owned by a
   * partner, and its opt-in gate is only armed when it is partner-funded (the
   * use-case passes the resolved funding partner in `scope`).
   */
  static open(input: {
    fields: Omit<
      NewPromotion,
      'appliesTo' | 'appliesToId' | 'createdByPartnerId' | 'fundingPartnerId' | 'partnerOptInAt'
    >;
    scope: ResolvedScope;
  }): NewPromotion {
    return {
      ...input.fields,
      appliesTo: input.scope.appliesTo,
      appliesToId: input.scope.appliesToId,
      createdByPartnerId: null,
      fundingPartnerId: input.scope.fundingPartnerId,
      partnerOptInAt: null,
    };
  }

  /**
   * Assemble a partner-created promotion: always partner-funded, funded by and owned
   * by that partner, and auto-opted-in (the partner creating it IS the consent).
   */
  static openForPartner(input: {
    fields: Omit<
      NewPromotion,
      | 'appliesTo'
      | 'appliesToId'
      | 'createdByPartnerId'
      | 'fundingPartnerId'
      | 'partnerOptInAt'
      | 'fundedBy'
    >;
    partnerId: string;
    appliesTo: PromoAppliesTo;
    appliesToId: string | null;
    now: Date;
  }): NewPromotion {
    return {
      ...input.fields,
      fundedBy: 'partner',
      appliesTo: input.appliesTo,
      appliesToId: input.appliesToId,
      createdByPartnerId: input.partnerId,
      fundingPartnerId: input.partnerId,
      partnerOptInAt: input.now,
    };
  }

  get id(): string {
    return this.state.id;
  }

  get code(): string | null {
    return this.state.code;
  }

  get status(): PromoStatus {
    return this.state.status;
  }

  get isEnded(): boolean {
    return this.state.status === 'ended';
  }

  get fundedBy(): PromoFundedBy {
    return this.state.fundedBy;
  }

  get fundingPartnerId(): string | null {
    return this.state.fundingPartnerId;
  }

  get partnerOptInAt(): Date | null {
    return this.state.partnerOptInAt;
  }

  get createdByPartnerId(): string | null {
    return this.state.createdByPartnerId;
  }

  get appliesTo(): PromoAppliesTo {
    return this.state.appliesTo;
  }

  get appliesToId(): string | null {
    return this.state.appliesToId;
  }

  get discountType(): PromoDiscountType {
    return this.state.discountType;
  }

  get discountValue(): bigint {
    return this.state.discountValue;
  }

  /** An ended promotion is frozen — it can never be edited again. */
  assertEditable(): void {
    if (this.isEnded) throw new PromotionEnded();
  }

  /** Only the partner that created a promotion may manage it. */
  assertCreatedBy(partnerId: string): void {
    if (this.state.createdByPartnerId !== partnerId) throw new PromotionNotOwned();
  }

  /** Opt-in is only for the funding partner of a partner-funded promo, and only once. */
  assertCanOptIn(partnerId: string): void {
    if (this.state.fundedBy !== 'partner' || this.state.fundingPartnerId !== partnerId) {
      throw new PromotionNotFundedByPartner();
    }
    if (this.state.partnerOptInAt !== null) throw new PromotionAlreadyOptedIn();
  }

  /**
   * The tri-state merge: a key is written only when the caller actually supplied it
   * (`undefined` = keep the stored value), `null` clears an optional condition, and an
   * empty `timeWindows` array clears too ("no windows" and "always applicable" are the
   * same state).
   *
   * Scope/funding fields are NOT handled here — the caller writes them, because which
   * of `appliesTo`/`appliesToId` gets written depends on which keys the client sent.
   * The funding-consent rule lives in {@link Promotion.resolveFundingChange}.
   */
  applyUpdate(input: PromotionUpdateInput): PromotionPatch {
    const patch: PromotionPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.discountType !== undefined) patch.discountType = input.discountType;
    if (input.discountValue !== undefined) patch.discountValue = input.discountValue;
    if (input.maxDiscount !== undefined) patch.maxDiscount = input.maxDiscount;
    if (input.minOrderAmount !== undefined) patch.minOrderAmount = input.minOrderAmount;
    if (input.firstBookingOnly !== undefined) patch.firstBookingOnly = input.firstBookingOnly;
    if (input.usageLimitTotal !== undefined) patch.usageLimitTotal = input.usageLimitTotal;
    if (input.usageLimitPerCustomer !== undefined) {
      patch.usageLimitPerCustomer = input.usageLimitPerCustomer;
    }
    if (input.timeWindows !== undefined) {
      patch.timeWindows =
        input.timeWindows === null || input.timeWindows.length === 0 ? null : input.timeWindows;
    }
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt;
    if (input.status !== undefined) patch.status = input.status;
    return patch;
  }

  /**
   * §12.2 — the funding-consent rule for a re-pointed promotion. `partnerOptInAt` IS
   * the funding partner's consent, so it must never survive a change of who pays:
   *   - a partner-funded promo keeps its gate only while the funding partner is
   *     unchanged; a different partner has to opt in again before it applies to them;
   *   - moving back to tenant funding drops the gate entirely.
   * Returns only the funding fields to merge into the patch (the caller owns the
   * scope fields — see {@link Promotion.applyUpdate}).
   */
  resolveFundingChange(next: {
    fundedBy: PromoFundedBy;
    fundingPartnerId: string | null;
  }): FundingChange {
    if (next.fundedBy !== 'partner') {
      return { fundedBy: 'tenant', fundingPartnerId: null, partnerOptInAt: null };
    }
    const gateSurvives = next.fundingPartnerId === this.state.fundingPartnerId;
    return {
      fundedBy: 'partner',
      fundingPartnerId: next.fundingPartnerId,
      ...(gateSurvives ? {} : { partnerOptInAt: null }),
    };
  }
}
