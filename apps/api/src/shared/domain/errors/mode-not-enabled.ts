import { DomainError } from '../domain-error';

/** Shared wire error for listing, booking, catalog, and scheduling mode guards. */
export class ModeNotEnabled extends DomainError {
  constructor(mode: string) {
    super('MODE_NOT_ENABLED', 400, `Listing does not enable "${mode}"`);
  }
}
