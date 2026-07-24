import { InternalServerErrorException } from '@nestjs/common';

/** Defensive 500: a successful insert could not be read back through its view. */
export class AffiliateReadbackFailed extends InternalServerErrorException {
  constructor() {
    super({
      statusCode: 500,
      code: 'AFFILIATE_NOT_FOUND',
      message: 'Affiliate could not be read back after creation',
    });
  }
}
