import { createHmac, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  GatewayKey,
  PaymentGatewayPort,
  PaymentStatusResult,
  RefundInput,
  RefundResult,
  WebhookVerification,
} from '../../domain/ports/payment-gateway.port';

function secret(): string {
  return process.env.MOCK_WEBHOOK_SECRET ?? 'mock-webhook-secret';
}

/** Deterministic HMAC over a mock webhook body — exported so tests can sign. */
export function signMockWebhook(gatewayTxnId: string, event: string, amountVnd: bigint): string {
  return createHmac('sha256', secret()).update(`${gatewayTxnId}.${event}.${amountVnd}`).digest('hex');
}

interface MockBody {
  gatewayTxnId: string;
  event: 'succeeded' | 'failed' | 'expired';
  amountVnd: string;
  signature: string;
}

/**
 * Mock gateway (§11.1) for dev/test/E2E. Webhooks are signed with a shared HMAC
 * secret so no per-tenant credentials are needed — the CI-tested payment path.
 */
@Injectable()
export class MockGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'mock';

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const gatewayTxnId = `mock_${randomUUID()}`;
    return Promise.resolve({ paymentUrl: `mock://pay/${gatewayTxnId}?order=${input.orderCode}`, gatewayTxnId });
  }

  peekReference(rawBody: Buffer): string | null {
    try {
      return (JSON.parse(rawBody.toString('utf8')) as MockBody).gatewayTxnId ?? null;
    } catch {
      return null;
    }
  }

  verifyWebhook(rawBody: Buffer): WebhookVerification {
    const body = JSON.parse(rawBody.toString('utf8')) as MockBody;
    const expected = signMockWebhook(body.gatewayTxnId, body.event, BigInt(body.amountVnd));
    return {
      valid: body.signature === expected,
      event: body.event,
      gatewayTxnId: body.gatewayTxnId,
      amountVnd: BigInt(body.amountVnd),
    };
  }

  refund(input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({ supported: true, refundId: `mock_refund_${randomUUID()}_${input.gatewayTxnId.slice(-4)}` });
  }

  queryPaymentStatus(): Promise<PaymentStatusResult> {
    // The mock has no persistent state; a reconciliation poll treats it as paid.
    return Promise.resolve({ status: 'succeeded', amountVnd: 0n });
  }
}
