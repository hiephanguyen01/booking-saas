import { DomainError } from '../../../../shared/domain/domain-error';
import type { PromoAppliesTo } from '../promotion-discount';

/**
 * Domain errors for the Promotion aggregate. Every code + status + message is
 * byte-identical to the pre-refactor use-case/helper behaviour (wire frozen).
 */

export class PromotionNotFound extends DomainError {
  constructor() {
    super('PROMO_NOT_FOUND', 404, 'Promotion not found');
  }
}

export class PromotionEnded extends DomainError {
  constructor() {
    super('PROMO_ENDED', 409, 'An ended promotion cannot be edited');
  }
}

export class PromotionNotOwned extends DomainError {
  constructor() {
    super('PROMO_NOT_OWNED', 403, 'Not your promotion');
  }
}

export class PromotionCodeTaken extends DomainError {
  constructor(code: string) {
    super('PROMO_CODE_TAKEN', 409, `Code "${code}" is already in use`);
  }
}

export class PromotionNotFundedByPartner extends DomainError {
  constructor() {
    super('PROMO_NOT_FUNDED_BY_PARTNER', 403, 'Not a promotion you fund');
  }
}

export class PromotionAlreadyOptedIn extends DomainError {
  constructor() {
    super('PROMO_ALREADY_OPTED_IN', 409, 'Already opted in');
  }
}

/** A non-`all` scope was declared without a target id. */
export class PromoScopeTargetMissing extends DomainError {
  constructor() {
    super('PROMO_SCOPE_TARGET_INVALID', 400, 'A scoped promotion requires a target id');
  }
}

/** The target id does not resolve to an entity of the declared type in this tenant. */
export class PromoScopeTargetInvalid extends DomainError {
  constructor(appliesTo: PromoAppliesTo, appliesToId: string) {
    super(
      'PROMO_SCOPE_TARGET_INVALID',
      400,
      `The target "${appliesToId}" is not a ${appliesTo} in this tenant`,
    );
  }
}

export class PromoScopeRequired extends DomainError {
  constructor() {
    super('PROMO_SCOPE_REQUIRED', 400, 'A target is required');
  }
}

export class PromoScopeNotOwned extends DomainError {
  constructor() {
    super('PROMO_SCOPE_NOT_OWNED', 403, 'A partner can only promote its own listings');
  }
}

export class PromoScopeUnsupported extends DomainError {
  constructor() {
    super(
      'PROMO_SCOPE_UNSUPPORTED',
      400,
      'A partner promotion must target the partner itself, one of its listings, or a listing group',
    );
  }
}

export class PromoFundingPartnerUnresolved extends DomainError {
  constructor() {
    super(
      'PROMO_FUNDING_PARTNER_UNRESOLVED',
      400,
      'A partner-funded promotion must target a partner, listing, or listing group',
    );
  }
}

/** §12.4 — a tenant-funded discount that would drive the tenant commission share negative. */
export class PromoTenantShareNegative extends DomainError {
  constructor(reason: string) {
    super('PROMO_TENANT_SHARE_NEGATIVE', 400, reason);
  }
}
