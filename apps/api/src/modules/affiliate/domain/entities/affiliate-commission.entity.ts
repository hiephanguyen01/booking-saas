import {
  computeAffiliateCommission,
  type AffiliateAmountInput,
} from '../affiliate-commission-amount';

export type AffiliateCommissionStatus =
  | 'pending'
  | 'confirmed'
  | 'paid'
  | 'reversed'
  | 'clawed_back';

/** The only source status eligible for the repository's set-based paid update. */
export const AFFILIATE_COMMISSION_PAID_SOURCE_STATUS = 'confirmed' as const;

/** The narrow persisted state owned by AffiliateCommission. */
export interface AffiliateCommissionState {
  id: string;
  tenantId: string;
  affiliateId: string;
  bookingId: string;
  amount: bigint;
  status: AffiliateCommissionStatus;
  createdAt: Date;
}

/** Validated insert payload (id/createdAt assigned by the DB). */
export interface NewAffiliateCommission {
  tenantId: string;
  affiliateId: string;
  bookingId: string;
  amount: bigint;
  status: 'pending' | 'confirmed';
}

/** Frozen booking finance facts shared by pending and confirmed calculation. */
export type AffiliateCommissionAmountFacts = Omit<
  AffiliateAmountInput,
  'additionalCharges'
>;

export interface ConfirmedAffiliateCommissionAmountFacts
  extends AffiliateCommissionAmountFacts {
  /** Already normalized/clamped by the booking-finance projection. */
  normalizedAdditionalCharges: bigint;
}

/**
 * One booking's affiliate commission.
 *
 * Every event-driven transition is no-throw and idempotent. An ineligible
 * redelivery returns false without mutating state, so an at-least-once outbox
 * event cannot be wedged by a terminal row.
 *
 * Paid remains a repository-owned set-based transition guarded by
 * {@link AFFILIATE_COMMISSION_PAID_SOURCE_STATUS}; there is intentionally no
 * per-instance `markPaid`.
 *
 * Framework-free: no Nest, Prisma, or zod imports.
 */
export class AffiliateCommission {
  private constructor(private state: AffiliateCommissionState) {}

  /** Rehydrate without validating or normalizing persisted legacy state. */
  static rehydrate(state: AffiliateCommissionState): AffiliateCommission {
    return new AffiliateCommission(state);
  }

  /** Create the absent row for booking.confirmed; charges are always zero. */
  static openPending(
    input: {
      tenantId: string;
      affiliateId: string;
      bookingId: string;
    } & AffiliateCommissionAmountFacts,
  ): NewAffiliateCommission {
    return {
      tenantId: input.tenantId,
      affiliateId: input.affiliateId,
      bookingId: input.bookingId,
      amount: computePendingAmount(input),
      status: 'pending',
    };
  }

  /**
   * Create the absent row for booking.completed. This preserves the current
   * upsert behavior when completion arrives before confirmation.
   */
  static openConfirmed(
    input: {
      tenantId: string;
      affiliateId: string;
      bookingId: string;
    } & ConfirmedAffiliateCommissionAmountFacts,
  ): NewAffiliateCommission {
    return {
      tenantId: input.tenantId,
      affiliateId: input.affiliateId,
      bookingId: input.bookingId,
      amount: computeConfirmedAmount(input),
      status: 'confirmed',
    };
  }

  get id(): string {
    return this.state.id;
  }

  get tenantId(): string {
    return this.state.tenantId;
  }

  get affiliateId(): string {
    return this.state.affiliateId;
  }

  get bookingId(): string {
    return this.state.bookingId;
  }

  get amount(): bigint {
    return this.state.amount;
  }

  get status(): AffiliateCommissionStatus {
    return this.state.status;
  }

  /**
   * booking.confirmed redelivery may rewrite/recompute only an existing pending
   * row. Terminal or otherwise ineligible state is a no-op.
   */
  recordPending(input: AffiliateCommissionAmountFacts): boolean {
    if (this.state.status !== 'pending') return false;
    this.state = {
      ...this.state,
      amount: computePendingAmount(input),
      status: 'pending',
    };
    return true;
  }

  /** booking.completed confirms/recomputes pending or already-confirmed rows. */
  confirm(input: ConfirmedAffiliateCommissionAmountFacts): boolean {
    if (
      this.state.status !== 'pending' &&
      this.state.status !== 'confirmed'
    ) {
      return false;
    }
    this.state = {
      ...this.state,
      amount: computeConfirmedAmount(input),
      status: 'confirmed',
    };
    return true;
  }

  /** Pre-completion cancellation/rejection/expiry voids only live commissions. */
  reverse(): boolean {
    if (
      this.state.status !== 'pending' &&
      this.state.status !== 'confirmed'
    ) {
      return false;
    }
    this.state = { ...this.state, status: 'reversed' };
    return true;
  }

  /** A post-completion refund takes back confirmed or already-paid commission. */
  clawback(): boolean {
    if (
      this.state.status !== 'confirmed' &&
      this.state.status !== 'paid'
    ) {
      return false;
    }
    this.state = { ...this.state, status: 'clawed_back' };
    return true;
  }
}

function computePendingAmount(
  input: AffiliateCommissionAmountFacts,
): bigint {
  return computeAffiliateCommission({
    ...input,
    additionalCharges: 0n,
  });
}

function computeConfirmedAmount(
  input: ConfirmedAffiliateCommissionAmountFacts,
): bigint {
  return computeAffiliateCommission({
    snapshot: input.snapshot,
    totalAmount: input.totalAmount,
    finalAmount: input.finalAmount,
    additionalCharges: input.normalizedAdditionalCharges,
    fundedBy: input.fundedBy,
  });
}
