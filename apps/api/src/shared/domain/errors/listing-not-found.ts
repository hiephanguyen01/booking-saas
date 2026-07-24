import { DomainError } from '../domain-error';

/** Shared wire error for modules that resolve a listing by id/slug. */
export class ListingNotFound extends DomainError {
  constructor() {
    super('LISTING_NOT_FOUND', 404, 'Listing not found');
  }
}
