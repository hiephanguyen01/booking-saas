import { DomainError } from '../../../../shared/domain/domain-error';
import type { IncompatibleDepositCoverage } from '../ports/commission-rule-repository.port';

export class CommissionRuleNotFound extends DomainError {
  constructor() {
    super('RULE_NOT_FOUND', 404, 'Commission rule not found');
  }
}

export class CommissionRatesNegativeTenant extends DomainError {
  constructor() {
    super(
      'COMMISSION_RATES_NEGATIVE_TENANT',
      400,
      'platform% + affiliate% must not exceed the tenant commission% (the tenant share would go negative)',
    );
  }
}

export class CommissionExceedsPartnerDeposit extends DomainError {
  constructor(incompatible: IncompatibleDepositCoverage) {
    super(
      'COMMISSION_EXCEEDS_PARTNER_DEPOSIT',
      400,
      `${incompatible.count} listing(s) would have a deposit below their effective commission`,
      {
        incompatibleListings: incompatible.count,
        samples: incompatible.samples,
      },
    );
  }
}

export class DefaultCommissionRuleLocked extends DomainError {
  constructor() {
    super('DEFAULT_RULE_LOCKED', 400, 'The tenant default rule cannot be deleted');
  }
}

export class NothingToPay extends DomainError {
  constructor() {
    super('NOTHING_TO_PAY', 400, 'No matured payable for this payee');
  }
}

export class PayoutBelowMinimum extends DomainError {
  constructor(available: bigint, minimum: bigint) {
    super('BELOW_MINIMUM', 400, `Payable ${available} is below the ${minimum} minimum`);
  }
}

export class PayoutAllocationMismatch extends DomainError {
  constructor(payoutAmount: bigint, allocatedAmount: bigint) {
    super(
      'PAYOUT_ALLOCATION_MISMATCH',
      409,
      'Partner payable is not fully backed by released settlements',
      {
        payoutAmount: payoutAmount.toString(),
        allocatedAmount: allocatedAmount.toString(),
      },
    );
  }
}

export class PayoutNotFound extends DomainError {
  constructor() {
    super('PAYOUT_NOT_FOUND', 404, 'Payout not found');
  }
}

export class PayoutSettled extends DomainError {
  constructor(status: string) {
    super('PAYOUT_SETTLED', 400, `Payout already ${status}`);
  }
}

export class PayoutInProgress extends DomainError {
  constructor() {
    super('PAYOUT_IN_PROGRESS', 409, 'Payout is already being processed');
  }
}

export class PayoutStateChanged extends DomainError {
  constructor() {
    super('PAYOUT_STATE_CHANGED', 409, 'Payout state changed concurrently');
  }
}

export class SettlementNotFound extends DomainError {
  constructor() {
    super('SETTLEMENT_NOT_FOUND', 404, 'Settlement not found');
  }
}

export class FinanceBookingNotFound extends DomainError {
  constructor(message: string) {
    super('BOOKING_NOT_FOUND', 404, message);
  }
}

export class HeldSettlementMissing extends DomainError {
  constructor() {
    super(
      'HELD_SETTLEMENT_MISSING',
      409,
      'Successful payment has not created its held settlement yet',
    );
  }
}

export class SettlementOnsiteAmountMismatch extends DomainError {
  constructor(reported: bigint, expected: bigint) {
    super(
      'ONSITE_AMOUNT_MISMATCH',
      409,
      `On-site amount ${reported} does not match the outstanding ${expected}`,
    );
  }
}

export class SettlementJournalExists extends DomainError {
  constructor() {
    super('SETTLEMENT_JOURNAL_EXISTS', 409, 'Booking already has a revenue journal');
  }
}

export class SettlementNotReleasable extends DomainError {
  constructor() {
    super('SETTLEMENT_NOT_RELEASABLE', 409, 'Settlement is not due or was concurrently changed');
  }
}

export class FinanceTenantNotFound extends DomainError {
  constructor() {
    super('TENANT_NOT_FOUND', 404, 'Tenant not found');
  }
}

export class CustomerBookingNotFound extends DomainError {
  constructor() {
    super('BOOKING_NOT_FOUND', 404, 'Booking not found');
  }
}

export class DisputeAlreadyResolved extends DomainError {
  constructor() {
    super('DISPUTE_ALREADY_RESOLVED', 409, 'This settlement has already used its dispute review');
  }
}

export class DisputeWindowClosed extends DomainError {
  constructor() {
    super('DISPUTE_WINDOW_CLOSED', 409, 'The settlement is not inside an open dispute window');
  }
}

export class DisputeResponseNotAccepted extends DomainError {
  constructor() {
    super(
      'DISPUTE_RESPONSE_NOT_ACCEPTED',
      409,
      'The dispute is closed, already answered, or does not belong to this partner',
    );
  }
}

export class DisputeNotFound extends DomainError {
  constructor() {
    super('DISPUTE_NOT_FOUND', 404, 'Dispute not found');
  }
}

export class DisputeNotResolvable extends DomainError {
  constructor() {
    super('DISPUTE_NOT_RESOLVABLE', 409, 'Settlement is no longer disputed');
  }
}

export class InvalidDisputeRefundAmount extends DomainError {
  constructor() {
    super(
      'INVALID_REFUND_AMOUNT',
      400,
      'Refund amount must be positive and not exceed the remaining amount held',
    );
  }
}

export class PartialRefundMustBePartial extends DomainError {
  constructor() {
    super(
      'PARTIAL_REFUND_MUST_BE_PARTIAL',
      400,
      'Use full_refund when refunding the entire held amount',
    );
  }
}
