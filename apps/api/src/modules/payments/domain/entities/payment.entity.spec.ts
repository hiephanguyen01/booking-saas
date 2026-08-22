import { describe, expect, it } from 'vitest';
import type { WebhookEvent } from '../ports/payment-gateway.port';
import { Payment } from './payment.entity';

describe('Payment webhook transitions', () => {
  it('ignores a non-final pending provider event', () => {
    expect(Payment.decideWebhookTransition('pending' as WebhookEvent)).toEqual({ action: 'ignore' });
  });
});
