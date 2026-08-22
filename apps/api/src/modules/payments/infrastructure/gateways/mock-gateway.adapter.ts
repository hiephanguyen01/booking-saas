import { createHmac, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CustomerPaymentMethod } from '@booking/contracts';
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

/** Deterministic HMAC over a mock webhook body — exported so disposable proofs/dev tools can sign. */
export function signMockWebhook(gatewayTxnId: string, event: string, amountVnd: bigint): string {
  return createHmac('sha256', secret())
    .update(`${gatewayTxnId}.${event}.${amountVnd}`)
    .digest('hex');
}

interface MockBody {
  gatewayTxnId: string;
  event: 'succeeded' | 'failed' | 'expired';
  amountVnd: string;
  signature: string;
}

type MockTxnState = { status: PaymentStatusResult['status']; amountVnd: bigint };

@Injectable()
export class MockGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'mock';
  private readonly ledger = new Map<string, MockTxnState>();

  prepareOrderReference(paymentId: string): string {
    return paymentId;
  }

  providerPaymentMethod(method: CustomerPaymentMethod): string {
    return method;
  }

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const gatewayTxnId = `mock_${randomUUID()}`;
    const orderRef = input.gatewayOrderRef ?? input.paymentId;
    this.ledger.set(gatewayTxnId, { status: 'pending', amountVnd: input.amountVnd });
    return Promise.resolve({
      destination: {
        type: 'redirect',
        paymentUrl: `mock://pay/${gatewayTxnId}?order=${encodeURIComponent(orderRef)}`,
      },
      gatewayTxnId,
      gatewayOrderRef: orderRef,
      paymentMethod: input.paymentMethod,
    });
  }

  markPaid(gatewayTxnId: string, amountVnd?: bigint): void {
    const prev = this.ledger.get(gatewayTxnId);
    this.ledger.set(gatewayTxnId, {
      status: 'succeeded',
      amountVnd: amountVnd ?? prev?.amountVnd ?? 0n,
    });
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
    const amountVnd = BigInt(body.amountVnd);
    const expected = signMockWebhook(body.gatewayTxnId, body.event, amountVnd);
    const valid = body.signature === expected;
    if (valid) this.ledger.set(body.gatewayTxnId, { status: body.event, amountVnd });
    return { valid, event: body.event, gatewayTxnId: body.gatewayTxnId, amountVnd };
  }

  refund(input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({
      supported: true,
      refundId: `mock_refund_${randomUUID()}_${input.gatewayTxnId.slice(-4)}`,
    });
  }

  queryPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult> {
    const state = this.ledger.get(gatewayTxnId);
    return Promise.resolve(state ?? { status: 'pending', amountVnd: 0n });
  }
}
