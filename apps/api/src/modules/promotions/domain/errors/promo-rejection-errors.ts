import { DomainError } from '../../../../shared/domain/domain-error';
import type { PromoRejection } from '../promotion-discount';

/**
 * Stable storefront promotion rejection. The status/code/message triple is
 * byte-identical to the former Nest exception produced by `promo-rejection.ts`.
 */
export class PromoRejectionError extends DomainError {
  constructor(rejection: PromoRejection) {
    super(rejection, rejection === 'PROMO_LIMIT_REACHED' ? 409 : 400, rejection);
  }
}
