import { DomainError } from '../../../../shared/domain/domain-error';

export { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
export { ListingNotFound as BookingListingNotFound } from '../../../../shared/domain/errors/listing-not-found';
export { ModeNotEnabled as BookingModeNotEnabled } from '../../../../shared/domain/errors/mode-not-enabled';

export class StorefrontSuspended extends DomainError {
  constructor() {
    super('STOREFRONT_SUSPENDED', 403, 'This storefront is not accepting bookings');
  }
}

export class InvalidBookingRange extends DomainError {
  constructor() {
    super('INVALID_RANGE', 400, 'from must be before to');
  }
}

export class BookingSlotInPast extends DomainError {
  constructor() {
    super('SLOT_IN_PAST', 400, 'Cannot book a past slot');
  }
}

export class BookingSlotPolicyRejected extends DomainError {
  constructor(code: string) {
    super(code, 400, 'The requested slot is outside the listing availability policy');
  }
}

export class BookingPriceChanged extends DomainError {
  constructor(expectedSubtotal: string, currentSubtotal: string) {
    super('PRICE_CHANGED', 409, 'The price changed after this checkout was opened', {
      expectedSubtotal,
      currentSubtotal,
    });
  }
}

export class BookingOutOfStock extends DomainError {
  constructor(remaining: number) {
    super('OUT_OF_STOCK', 409, `Only ${remaining} unit(s) available for this period`);
  }
}

export class DepositBelowTenantCommission extends DomainError {
  constructor(
    depositAmount: bigint,
    minimumDepositAmount: bigint,
    commissionRuleId: string | null,
  ) {
    super(
      'DEPOSIT_BELOW_TENANT_COMMISSION',
      400,
      'The customer deposit must cover the tenant commission for this booking',
      {
        depositAmount: depositAmount.toString(),
        minimumDepositAmount: minimumDepositAmount.toString(),
        commissionRuleId,
      },
    );
  }
}

export class GuestInfoRequired extends DomainError {
  constructor() {
    super('GUEST_INFO_REQUIRED', 400, 'Provide guest details or sign in to book');
  }
}

export class BookingSlotHeld extends DomainError {
  constructor(message: string) {
    super('SLOT_HELD', 409, message);
  }
}

export class BookingSlotTaken extends DomainError {
  constructor(message: string) {
    super('SLOT_TAKEN', 409, message);
  }
}

export class BookingNotOwned extends DomainError {
  constructor() {
    super('NOT_OWNED', 403, 'Booking belongs to another partner');
  }
}

export class BookingAccessDenied extends DomainError {
  constructor() {
    super('BOOKING_ACCESS_DENIED', 401, 'A valid OTP or session is required');
  }
}

export class InvalidNoShowWindow extends DomainError {
  constructor(hours: number) {
    super(
      'NO_SHOW_WINDOW_INVALID',
      422,
      `A booking can only be marked no-show after it ends and within ${hours}h of the end time`,
    );
  }
}

export class InventoryRequiresReturn extends DomainError {
  constructor() {
    super(
      'INVENTORY_REQUIRES_RETURN',
      400,
      'Inventory bookings are completed through the return workflow',
    );
  }
}

export class BookingServiceNotEnded extends DomainError {
  constructor() {
    super('SERVICE_NOT_ENDED', 409, 'A booking can only be completed after its scheduled end time');
  }
}

export class OnsiteAmountMismatch extends DomainError {
  constructor(reported: bigint, expected: bigint) {
    super(
      'ONSITE_AMOUNT_MISMATCH',
      409,
      `On-site amount ${reported} does not match the outstanding ${expected}`,
      {
        expectedOnsiteAmount: expected.toString(),
        reportedOnsiteAmount: reported.toString(),
      },
    );
  }
}

export class BookingNotConfirmed extends DomainError {
  constructor() {
    super('NOT_CONFIRMED', 400, 'Only a confirmed rental can be picked up');
  }
}

export class BookingNotInventory extends DomainError {
  constructor() {
    super('NOT_INVENTORY', 400, 'Return applies to inventory rentals only');
  }
}

export class BookingStateChanged extends DomainError {
  constructor() {
    super('BOOKING_STATE_CHANGED', 409, 'The booking is no longer in the expected state');
  }
}
