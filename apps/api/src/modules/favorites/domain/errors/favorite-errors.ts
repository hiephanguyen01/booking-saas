import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the Favorite aggregate. Code + status + message are byte-identical
 * to the pre-refactor use-case behaviour (wire frozen). `TENANT_NOT_FOUND` is NOT
 * re-minted here — it is the shared-kernel `TenantNotFound` (style-gate 2026-07-23).
 */

/** The hearted listing/group does not exist, or is not published. */
export class FavoriteTargetNotFound extends DomainError {
  constructor() {
    super('FAVORITE_TARGET_NOT_FOUND', 404, 'Listing or group not found');
  }
}
