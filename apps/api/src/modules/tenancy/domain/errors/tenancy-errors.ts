import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Tenant / TenantDomain aggregates. Codes + statuses +
 * messages are byte-identical to the pre-refactor use-case behaviour, with ONE
 * owner-approved exception: `TENANT_NOT_FOUND` is no longer minted here. Tenancy
 * used to answer `Tenant ${id} not found` while every other module used the shared
 * kernel's `Tenant not found`; the owner chose the shared, id-free message, so all
 * eight tenancy sites now import `shared/domain/errors/tenant-not-found`.
 */

export class TenantSlugTaken extends DomainError {
  constructor(slug: string) {
    super('TENANT_SLUG_TAKEN', 409, `Slug "${slug}" is already in use`);
  }
}

export class DomainTaken extends DomainError {
  constructor(hostname: string) {
    super('DOMAIN_TAKEN', 409, `Hostname "${hostname}" is already mapped`);
  }
}

export class InvalidCancellationPolicy extends DomainError {
  constructor() {
    super(
      'INVALID_CANCELLATION_POLICY',
      400,
      'Default must be a tenant-level cancellation policy of this tenant',
    );
  }
}

/** The verify path answers with the id; the other domain paths do not (see below). */
export class DomainNotFoundForTenant extends DomainError {
  constructor(domainId: string) {
    super('DOMAIN_NOT_FOUND', 404, `Domain ${domainId} not found for this tenant`);
  }
}

/** Same code as {@link DomainNotFoundForTenant} but the static message the
 *  set-primary / delete paths have always returned — the two are NOT interchangeable. */
export class DomainNotFound extends DomainError {
  constructor() {
    super('DOMAIN_NOT_FOUND', 404, 'Domain not found');
  }
}

export class DomainNotVerifiable extends DomainError {
  constructor() {
    super('DOMAIN_NOT_VERIFIABLE', 400, 'Domain has no verification token');
  }
}

export class DomainNotVerified extends DomainError {
  constructor() {
    super('DOMAIN_NOT_VERIFIED', 400, 'A domain must be verified before it can become primary');
  }
}

export class DomainPrimaryRequired extends DomainError {
  constructor() {
    super('DOMAIN_PRIMARY_REQUIRED', 409, 'Cannot remove the only verified primary domain');
  }
}

export class UnknownTenantHost extends DomainError {
  constructor(hostname: string) {
    super('UNKNOWN_HOST', 404, `No tenant mapped to host "${hostname}"`);
  }
}
