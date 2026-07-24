import { DomainError } from '../../../../shared/domain/domain-error';

export { ListingNotFound } from '../../../../shared/domain/errors/listing-not-found';

/**
 * Domain errors for the Listing aggregate. Shared across the listing module's
 * sub-PRs (#11a/#11b/#11c) — named generically so cancellation-policy and
 * pricing-rule call-sites can reuse them. Codes + statuses + messages are
 * byte-identical to the pre-refactor use-case behaviour.
 */

export class ListingNotOwned extends DomainError {
  constructor() {
    super('LISTING_NOT_OWNED', 403, 'This listing belongs to another partner');
  }
}

/** The partner-scoped delete endpoint's answer when the listing isn't owned by
 *  the calling partner — same code as {@link ListingNotOwned} but a different
 *  message (that one explains editing, this one deleting, and this one omits
 *  the leading "This"); the two are NOT interchangeable. */
export class ListingNotOwnedForDelete extends DomainError {
  constructor() {
    super('LISTING_NOT_OWNED', 403, 'Listing belongs to another partner');
  }
}

/** The moderation guard's (`assertOwnership`) answer when a submit/hide/republish
 *  is attempted by a partner who doesn't own the listing — a distinct code
 *  (`NOT_OWNED`, not `LISTING_NOT_OWNED`) AND a distinct message from both
 *  {@link ListingNotOwned} and {@link ListingNotOwnedForDelete}; NOT
 *  interchangeable with either. */
export class ListingNotOwnedForModeration extends DomainError {
  constructor() {
    super('NOT_OWNED', 403, 'This resource belongs to another partner');
  }
}

export class InvalidBookingModes extends DomainError {
  constructor(invalidModes: string[]) {
    super(
      'INVALID_BOOKING_MODES',
      400,
      `Modes not allowed by the listing type: ${invalidModes.join(', ')}`,
    );
  }
}

export class ListingSlugTaken extends DomainError {
  constructor(slug: string) {
    super('LISTING_SLUG_TAKEN', 409, `Slug "${slug}" is already in use`);
  }
}

export class ListingHasBookings extends DomainError {
  constructor(count: number) {
    super('LISTING_HAS_BOOKINGS', 409, `Cannot delete a listing with ${count} booking(s)`);
  }
}

const GROUP_MANAGED_LISTING_MESSAGE: Record<'submit' | 'publish' | 'republish' | 'hide', string> = {
  submit: 'Submit the parent listing group instead',
  publish: 'Publish the parent listing group instead',
  republish: 'Republish the parent listing group instead',
  hide: 'Hide the parent listing group instead',
};

/** Thrown by the 4 moderation transitions (submit/publish/republish/hide) when
 *  the listing is bound to a group — the parent group must be moderated
 *  instead. One code, 4 action-specific messages. */
export class GroupManagedListing extends DomainError {
  constructor(action: 'submit' | 'publish' | 'republish' | 'hide') {
    super('GROUP_MANAGED_LISTING', 400, GROUP_MANAGED_LISTING_MESSAGE[action]);
  }
}

export class ResourceNotFound extends DomainError {
  constructor() {
    super('RESOURCE_NOT_FOUND', 404, 'Resource not found');
  }
}

export class ResourceNotOwned extends DomainError {
  constructor() {
    super('RESOURCE_NOT_OWNED', 403, 'The resource belongs to another partner');
  }
}

export class DepositBelowTenantCommission extends DomainError {
  constructor(depositPercent: number, minimumDepositPercent: bigint, commissionRuleId: string) {
    super(
      'DEPOSIT_BELOW_TENANT_COMMISSION',
      400,
      `Deposit ${depositPercent}% must be at least the tenant commission ${minimumDepositPercent}%`,
      {
        depositPercent,
        minimumDepositPercent: Number(minimumDepositPercent),
        commissionRuleId,
      },
    );
  }
}

export class InvalidListingAdministrativeDivision extends DomainError {
  constructor() {
    super(
      'INVALID_ADMINISTRATIVE_DIVISION',
      400,
      'Both provinceCode and wardCode are required when changing the address',
    );
  }
}

export class ListingHasContactInfo extends DomainError {
  constructor(target: 'listing' | 'group', details: unknown) {
    super(
      'LISTING_HAS_CONTACT_INFO',
      400,
      target === 'listing'
        ? 'Remove contact information from the listing before publishing'
        : 'Remove contact information from the post and its items before publishing',
      details,
    );
  }
}

/** A moderation pre-image changed after it was loaded; the caller must reload. */
export class ListingStateChanged extends DomainError {
  constructor() {
    super('LISTING_STATE_CHANGED', 409, 'Listing state changed; reload and try again');
  }
}
