import { DomainError } from '../domain-error';

/** Shared wire error for modules that resolve a partner. */
export class PartnerNotFound extends DomainError {
  constructor() {
    super('PARTNER_NOT_FOUND', 404, 'Partner not found');
  }
}
