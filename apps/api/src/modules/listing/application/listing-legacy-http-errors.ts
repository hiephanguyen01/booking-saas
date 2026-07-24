import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * The partner pricing-list endpoint historically omitted `statusCode` from
 * these bodies. Keep that legacy shape while removing literals from the
 * use-case.
 */
export class LegacyListingNotFound extends NotFoundException {
  constructor() {
    super({ code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
  }
}

export class LegacyListingNotOwned extends ForbiddenException {
  constructor() {
    super({
      code: 'LISTING_NOT_OWNED',
      message: 'This listing belongs to another partner',
    });
  }
}
