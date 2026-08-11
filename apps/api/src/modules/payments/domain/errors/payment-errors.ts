import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Payment aggregate (checkout + webhook confirmation).
 * Codes + statuses + messages are byte-identical to the pre-refactor use-case
 * behaviour.
 */

export class BookingNotPayable extends DomainError {
  constructor(status: string) {
    super('BOOKING_NOT_PAYABLE', 400, `Booking is ${status}, not awaiting payment`);
  }
}

/** A balance payment was requested on a booking that owes nothing (§8.3). */
export class NothingLeftToPay extends DomainError {
  constructor() {
    super('NOTHING_LEFT_TO_PAY', 409, 'This booking has no outstanding balance');
  }
}

export class PaymentMethodUnavailable extends DomainError {
  constructor() {
    super(
      'PAYMENT_METHOD_UNAVAILABLE',
      400,
      'The selected payment method is not enabled for this storefront',
    );
  }
}

export class NoActiveGateway extends DomainError {
  constructor() {
    super('NO_ACTIVE_GATEWAY', 400, 'Cửa hàng chưa bật cổng thanh toán');
  }
}

export class AmountExceedsGatewayLimit extends DomainError {
  constructor() {
    super(
      'AMOUNT_EXCEEDS_GATEWAY_LIMIT',
      400,
      'Đơn hàng vượt hạn mức thanh toán MoMo (tối đa 50.000.000đ)',
    );
  }
}

export class AmountMismatch extends DomainError {
  constructor() {
    super('AMOUNT_MISMATCH', 400, 'Paid amount is less than expected');
  }
}

export class PaymentStorefrontSuspended extends DomainError {
  constructor() {
    super('STOREFRONT_SUSPENDED', 403, 'This storefront is not accepting payments');
  }
}

export class InvalidStorefrontHost extends DomainError {
  constructor() {
    super('INVALID_STOREFRONT_HOST', 400, 'The storefront Host header is invalid');
  }
}
