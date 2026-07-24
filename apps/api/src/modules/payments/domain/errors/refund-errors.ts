import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Refund aggregate (execute-refund + manual confirmation).
 * Codes + statuses + messages are byte-identical to the pre-refactor use-case
 * behaviour.
 */

export class RefundAmountExceedsPayment extends DomainError {
  constructor() {
    super('REFUND_AMOUNT_EXCEEDS_PAYMENT', 400, 'Refund amount exceeds the captured payment');
  }
}

export class RefundNotFound extends DomainError {
  constructor() {
    super('REFUND_NOT_FOUND', 404, 'Refund not found');
  }
}

export class RefundNotConfirmable extends DomainError {
  constructor(status: string) {
    super('REFUND_NOT_CONFIRMABLE', 400, `Refund is ${status}`);
  }
}

export class RefundReferenceAlreadyUsed extends DomainError {
  constructor() {
    super('REFUND_REFERENCE_ALREADY_USED', 400, 'Refund reference has already been used');
  }
}
