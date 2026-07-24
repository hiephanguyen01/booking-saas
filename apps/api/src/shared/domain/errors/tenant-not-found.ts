import { DomainError } from '../domain-error';

/**
 * Shared wire error for the `TENANT_NOT_FOUND` code — many modules emit it
 * (host→tenant resolution), so it lives in the shared kernel instead of being
 * re-minted per module (style-gate 2026-07-23 §3).
 */
export class TenantNotFound extends DomainError {
  constructor() {
    super('TENANT_NOT_FOUND', 404, 'Tenant not found');
  }
}
