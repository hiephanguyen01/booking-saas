import { DomainError } from '../../../../shared/domain/domain-error';

export { BookingNotFound as CustomerBookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
export { TenantNotFound as FinanceTenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
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

export class TaxFilingNotFound extends DomainError {
  constructor() {
    super('TAX_FILING_NOT_FOUND', 404, 'Tax filing period not found');
  }
}

export class TaxFilingNotSubmittable extends DomainError {
  constructor() {
    super('TAX_FILING_NOT_SUBMITTABLE', 409, 'Only a draft tax filing can be submitted');
  }
}

export class TaxFilingNotPayable extends DomainError {
  constructor() {
    super('TAX_FILING_NOT_PAYABLE', 409, 'Only a submitted tax filing can be marked paid');
  }
}

export class TaxFilingConcurrentChange extends DomainError {
  constructor() {
    super('TAX_FILING_CONCURRENT_CHANGE', 409, 'Tax filing was concurrently changed');
  }
}

export class TaxRemittanceAmountMismatch extends DomainError {
  constructor() {
    super(
      'TAX_REMITTANCE_AMOUNT_MISMATCH',
      409,
      'Remittance VAT and PIT must match the submitted filing totals',
    );
  }
}

export class TaxFilingHasNoPayableAmount extends DomainError {
  constructor() {
    super(
      'TAX_FILING_HAS_NO_PAYABLE_AMOUNT',
      409,
      'This filing has no positive tax amount to remit; carry the credit forward or refund it instead',
    );
  }
}

export class InvalidTaxDocumentKey extends DomainError {
  constructor() {
    super(
      'INVALID_TAX_DOCUMENT_KEY',
      400,
      'Tax document must be a private PDF uploaded for this tenant',
    );
  }
}

export class TaxCertificateNotFound extends DomainError {
  constructor() {
    super('TAX_CERTIFICATE_NOT_FOUND', 404, 'Tax withholding certificate not found');
  }
}

export class TaxCertificateDocumentUnavailable extends DomainError {
  constructor() {
    super(
      'TAX_CERTIFICATE_DOCUMENT_UNAVAILABLE',
      409,
      'The tax withholding certificate document is not available',
    );
  }
}

export class TaxDocumentUploadInvalid extends DomainError {
  constructor(message = 'The private tax PDF could not be verified') {
    super('TAX_DOCUMENT_UPLOAD_INVALID', 409, message);
  }
}

export class TaxDocumentUploadExpired extends DomainError {
  constructor() {
    super(
      'TAX_DOCUMENT_UPLOAD_EXPIRED',
      409,
      'The tax document upload has expired; upload it again',
    );
  }
}

export class TaxCertificateYearNotClosed extends DomainError {
  constructor() {
    super(
      'TAX_CERTIFICATE_YEAR_NOT_CLOSED',
      409,
      'A certificate can only be issued after the Vietnam tax year has closed',
    );
  }
}

export class TaxCertificateNoWithholding extends DomainError {
  constructor() {
    super(
      'TAX_CERTIFICATE_NO_WITHHOLDING',
      409,
      'There is no positive withholding to certify for this partner and year',
    );
  }
}

export class TaxCertificateYearUnsettled extends DomainError {
  constructor(unsettledEventCount: number) {
    super(
      'TAX_CERTIFICATE_YEAR_UNSETTLED',
      409,
      `${unsettledEventCount} tax event(s) are not in a paid filing period`,
    );
  }
}

export class TaxCertificateAlreadyIssued extends DomainError {
  constructor() {
    super(
      'TAX_CERTIFICATE_ALREADY_ISSUED',
      409,
      'Void the active certificate before issuing a replacement',
    );
  }
}

export class TaxCertificateConcurrentChange extends DomainError {
  constructor() {
    super(
      'TAX_CERTIFICATE_CONCURRENT_CHANGE',
      409,
      'The tax certificate or its upload changed concurrently',
    );
  }
}

export class TaxCertificateConflict extends DomainError {
  constructor() {
    super(
      'TAX_CERTIFICATE_CONFLICT',
      409,
      'The certificate number, file, upload, or annual version has already been used',
    );
  }
}

export class TaxCertificateNotVoidable extends DomainError {
  constructor() {
    super('TAX_CERTIFICATE_NOT_VOIDABLE', 409, 'Only an active issued certificate can be voided');
  }
}
