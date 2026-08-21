import { DomainError } from '../../../../shared/domain/domain-error';

export { CancellationPolicyNotFound } from '../../../../shared/domain/errors/cancellation-policy-not-found';
export { PartnerNotFound } from '../../../../shared/domain/errors/partner-not-found';

/** Partner-owned 4xx errors with the pre-refactor wire bytes preserved exactly. */
export class TenantInactive extends DomainError {
  constructor() {
    super('TENANT_INACTIVE', 403, 'Tenant is not accepting partner applications');
  }
}

export class PartnerSlugTaken extends DomainError {
  constructor(slug: string) {
    super('PARTNER_SLUG_TAKEN', 409, `Slug "${slug}" is already in use`);
  }
}

export class InvalidPartnerState extends DomainError {
  constructor(status: string) {
    super('INVALID_PARTNER_STATE', 409, `Cannot approve a partner in "${status}" state`);
  }
}

export class InvalidPartnerDocumentReference extends DomainError {
  constructor() {
    super(
      'INVALID_PARTNER_DOCUMENT_REFERENCE',
      400,
      'Partner document reference is invalid or belongs to another owner',
    );
  }
}

export class PartnerHasActiveBookings extends DomainError {
  constructor() {
    super('PARTNER_HAS_ACTIVE_BOOKINGS', 409, 'Cannot suspend a partner with active bookings');
  }
}

export class NoPendingIdentity extends DomainError {
  constructor() {
    super('NO_PENDING_IDENTITY', 409, 'There is no pending identity submission to review');
  }
}

export class MissingDob extends DomainError {
  constructor() {
    super('MISSING_DOB', 400, 'Identity submission is missing a date of birth');
  }
}

export class Under18 extends DomainError {
  constructor() {
    super('UNDER_18', 403, 'Partner is under 18 — cannot verify for people-booking listing types');
  }
}

export class NameMismatch extends DomainError {
  constructor() {
    super('NAME_MISMATCH', 403, 'ID holder name does not match the payout account holder name');
  }
}

export class PartnerNotVerified extends DomainError {
  constructor() {
    super(
      'PARTNER_NOT_VERIFIED',
      403,
      'Partner must complete identity verification to serve this listing type',
    );
  }
}

export class PublicPartnerNotFound extends DomainError {
  constructor() {
    super('PUBLIC_PARTNER_NOT_FOUND', 404, 'Public partner profile not found');
  }
}

export class PartnerTaxAssessmentNotApplicable extends DomainError {
  constructor() {
    super(
      'PARTNER_TAX_ASSESSMENT_NOT_APPLICABLE',
      409,
      'Annual revenue threshold assessment only applies to household businesses',
    );
  }
}

export class FutureTaxYearDeclaration extends DomainError {
  constructor() {
    super('FUTURE_TAX_YEAR_DECLARATION', 400, 'Cannot declare revenue for a future tax year');
  }
}
