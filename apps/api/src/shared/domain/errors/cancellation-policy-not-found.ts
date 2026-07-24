import { DomainError } from '../domain-error';

/** Shared wire error for listing and partner cancellation-policy lookups. */
export class CancellationPolicyNotFound extends DomainError {
  constructor() {
    super('CANCELLATION_POLICY_NOT_FOUND', 404, 'Cancellation policy not found');
  }
}
