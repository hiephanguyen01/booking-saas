import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Review aggregate. Codes + HTTP statuses are kept
 * byte-identical to the pre-refactor controller/use-case behaviour so the wire
 * contract is unchanged (spec: byte-identical wire).
 */

/** A value object rejected its input (rating out of range, content length). Defensive:
 *  the zod DTO already validates these, so this normally never reaches the wire. */
export class ReviewValidationError extends DomainError {
  constructor(field: string, message: string) {
    super('VALIDATION_ERROR', 400, message, { fieldErrors: { [field]: [message] } });
  }
}

/** The booking is not an owned, completed, not-yet-reviewed booking (§16 eligibility). */
export class ReviewBookingNotEligible extends DomainError {
  constructor() {
    super(
      'REVIEW_BOOKING_NOT_ELIGIBLE',
      409,
      'Only an owned completed booking without a review can be reviewed',
    );
  }
}

/** Lost the race on the `(booking_id)` unique index — a review already exists. */
export class ReviewAlreadyExists extends DomainError {
  constructor() {
    super('REVIEW_ALREADY_EXISTS', 409, 'This booking already has a review');
  }
}

/** Reply rejected: review missing, already replied to, or owned by another partner (§16). */
export class ReviewReplyNotAccepted extends DomainError {
  constructor() {
    super(
      'REVIEW_REPLY_NOT_ACCEPTED',
      409,
      'Review is missing, already replied to, or belongs to another partner',
    );
  }
}

/** Lost the race on the `(review_id)` unique index — a reply already exists. */
export class ReviewReplyAlreadyExists extends DomainError {
  constructor() {
    super('REVIEW_REPLY_ALREADY_EXISTS', 409, 'This review already has a reply');
  }
}

/** The storefront Host did not resolve to a live tenant. */
export class ReviewTenantNotFound extends DomainError {
  constructor() {
    super('TENANT_NOT_FOUND', 404, 'Tenant not found');
  }
}
