import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PromoRejection } from '../domain/promotion-discount';

/** Maps a domain rejection to the HTTP status the storefront expects (§12.3). */
export function rejectionException(rejection: PromoRejection): BadRequestException | ConflictException {
  const body = { statusCode: rejection === 'PROMO_LIMIT_REACHED' ? 409 : 400, code: rejection, message: rejection };
  return rejection === 'PROMO_LIMIT_REACHED' ? new ConflictException(body) : new BadRequestException(body);
}
