import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** Technical/provider boundary errors that intentionally remain Nest exceptions. */
export class PaymentNotConfigured extends ServiceUnavailableException {
  constructor() {
    super({
      statusCode: 503,
      code: 'PAYMENT_NOT_CONFIGURED',
      message: 'This storefront is not accepting online payments',
    });
  }
}

export class BadWebhook extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'BAD_WEBHOOK',
      message: 'Unparseable webhook',
    });
  }
}

export class InvalidWebhookSignature extends UnauthorizedException {
  constructor() {
    super({
      statusCode: 401,
      code: 'INVALID_SIGNATURE',
      message: 'Webhook signature invalid',
    });
  }
}

export class InvalidGatewayConfig extends BadRequestException {
  constructor(details: unknown) {
    super({
      statusCode: 400,
      code: 'INVALID_GATEWAY_CONFIG',
      message: 'Cấu hình cổng thanh toán không hợp lệ',
      details,
    });
  }
}
