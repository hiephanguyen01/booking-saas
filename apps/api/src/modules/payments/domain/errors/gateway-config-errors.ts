import { DomainError } from '../../../../shared/domain/domain-error';

/**
 * Domain errors for the GatewayConfig aggregate (update-gateway-payment-settings).
 * Codes + statuses + messages are byte-identical to the pre-refactor use-case
 * behaviour.
 */

export class UnsupportedPaymentMethod extends DomainError {
  constructor(gateway: string, invalid: string[]) {
    super(
      'UNSUPPORTED_PAYMENT_METHOD',
      400,
      `Cổng ${gateway} không hỗ trợ phương thức: ${invalid.join(', ')}`,
    );
  }
}

export class GatewayConfigNotFound extends DomainError {
  constructor() {
    super(
      'GATEWAY_CONFIG_NOT_FOUND',
      404,
      'Configure payment credentials before enabling payment methods',
    );
  }
}
