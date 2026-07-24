import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors owned by the Affiliate, ReferralLink, and AffiliateCommission
 * aggregates. Every code + status + message is byte-identical to the
 * pre-refactor HTTP exception it replaces.
 *
 * `TENANT_NOT_FOUND` is the shared-kernel TenantNotFound and is deliberately not
 * re-minted here. The defensive 500 `AFFILIATE_NOT_FOUND` also stays a Nest
 * InternalServerErrorException at the application boundary.
 */

export class TenantInactive extends DomainError {
  constructor() {
    super(
      'TENANT_INACTIVE',
      403,
      'Tenant is not accepting affiliate applications',
    );
  }
}

export class AffiliateNotFound extends DomainError {
  constructor() {
    super('AFFILIATE_NOT_FOUND', 404, 'Affiliate not found');
  }
}

export class AffiliateMembershipRequired extends DomainError {
  constructor() {
    super('NOT_AN_AFFILIATE', 403, 'No affiliate account for this user');
  }
}

export class ApprovedAffiliateRequired extends DomainError {
  constructor() {
    super('NOT_AN_AFFILIATE', 403, 'No approved affiliate account for this user');
  }
}

export class AffiliateTenantShareFloorViolated extends DomainError {
  constructor() {
    super(
      'COMMISSION_RATES_NEGATIVE_TENANT',
      400,
      'platform% + affiliate% would exceed the tenant commission',
    );
  }
}

export class ReferralListingRequired extends DomainError {
  constructor() {
    super('LISTING_REQUIRED', 400, 'listingId is required');
  }
}

export class ReferralCodeCollision extends DomainError {
  constructor() {
    super('CODE_COLLISION', 409, 'Could not allocate a unique code');
  }
}

export class ReferralLinkNotFound extends DomainError {
  constructor() {
    super('LINK_NOT_FOUND', 404, 'Referral link not found');
  }
}

export class ReferralLinkNotOwned extends DomainError {
  constructor() {
    super('NOT_LINK_OWNER', 403, 'Not your referral link');
  }
}
