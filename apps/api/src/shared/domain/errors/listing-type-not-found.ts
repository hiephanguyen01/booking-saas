import { DomainError } from '../domain-error';

/**
 * Shared wire error for the `LISTING_TYPE_NOT_FOUND` code — more than one module
 * emits it (catalog owns listing types; the listing module rejects references to
 * a missing one), so it lives in the shared kernel instead of being re-minted per
 * module (style-gate 2026-07-23 §3).
 */
export class ListingTypeNotFound extends DomainError {
  constructor() {
    super('LISTING_TYPE_NOT_FOUND', 404, 'Listing type not found');
  }
}
