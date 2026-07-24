import { ForbiddenException } from '@nestjs/common';

export class PartnerPromotionsDisabled extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: 'PARTNER_PROMOTIONS_DISABLED',
      message: 'This tenant has not enabled partner-created promotions',
    });
  }
}
