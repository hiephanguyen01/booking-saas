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

export class InvalidPaymentRouting extends BadRequestException {
  constructor(details?: unknown) {
    super({
      statusCode: 400,
      code: 'INVALID_PAYMENT_ROUTING',
      message: 'Cấu hình định tuyến thanh toán không hợp lệ',
      ...(details === undefined ? {} : { details }),
    });
  }
}

export class PaymentRoutingProviderInactive extends BadRequestException {
  constructor(gateway: string) {
    super({
      statusCode: 400,
      code: 'PAYMENT_ROUTING_PROVIDER_INACTIVE',
      message: `Cổng thanh toán ${gateway} chưa được kết nối`,
    });
  }
}

export class InvalidRefundPolicy extends BadRequestException {
  constructor(details?: unknown) {
    super({
      statusCode: 400,
      code: 'INVALID_REFUND_POLICY',
      message: 'Chính sách hoàn tiền không hợp lệ',
      ...(details === undefined ? {} : { details }),
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

export class EmptyWebhookBody extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'EMPTY_BODY',
      message: 'Empty webhook body',
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

export class PayosWebhookNotConfigured extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'PAYOS_NOT_CONFIGURED',
      message: 'Hãy lưu và bật cấu hình PayOS trước khi xác nhận webhook',
    });
  }
}

export class PayosWebhookConfirmationFailed extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'PAYOS_WEBHOOK_CONFIRMATION_FAILED',
      message: 'PayOS từ chối xác nhận webhook. Hãy kiểm tra cấu hình và URL API public.',
    });
  }
}

export class PayosWebhookConfirmationUnavailable extends ServiceUnavailableException {
  constructor() {
    super({
      statusCode: 503,
      code: 'PAYOS_WEBHOOK_CONFIRMATION_UNAVAILABLE',
      message: 'Tạm thời không thể kết nối PayOS để xác nhận webhook',
    });
  }
}
