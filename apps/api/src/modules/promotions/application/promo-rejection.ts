import type { PromoRejection } from '../domain/promotion-discount';
import { PromoRejectionError } from '../domain/errors/promo-rejection.error';

/** Maps a domain rejection to the HTTP status the storefront expects (§12.3). */
export function rejectionException(rejection: PromoRejection): PromoRejectionError {
  return new PromoRejectionError(rejection);
}
