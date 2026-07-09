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

/** In-memory record of what the mock "gateway" believes it holds for a txn. */
type MockTxnState = { status: PaymentStatusResult['status']; amountVnd: bigint };

/**
 * Mock gateway (§11.1) for dev/test/E2E. Webhooks are signed with a shared HMAC
 * secret so no per-tenant credentials are needed — the CI-tested payment path.
 *
 * The adapter is a singleton, so it keeps an in-memory ledger of each txn's
 * state (created → pending, paid → succeeded). `queryPaymentStatus` reflects
 * that real state rather than blindly reporting `succeeded`, so a never-paid
 * booking can't be auto-confirmed by the reconciliation sweep (§11.2).
 */
@Injectable()
export class MockGatewayAdapter implements PaymentGatewayPort {
  readonly key: GatewayKey = 'mock';
  private readonly ledger = new Map<string, MockTxnState>();

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const gatewayTxnId = `mock_${randomUUID()}`;
    this.ledger.set(gatewayTxnId, { status: 'pending', amountVnd: input.amountVnd });
    return Promise.resolve({ paymentUrl: `mock://pay/${gatewayTxnId}?order=${input.orderCode}`, gatewayTxnId });
  }

  /**
   * Record a paid txn — the dev "Succeed" button / a lost-webhook reconciliation
   * scenario where the gateway really received the money. `amountVnd` defaults to
   * the amount captured at `createPayment`.
   */
  markPaid(gatewayTxnId: string, amountVnd?: bigint): void {
    const prev = this.ledger.get(gatewayTxnId);
    this.ledger.set(gatewayTxnId, { status: 'succeeded', amountVnd: amountVnd ?? prev?.amountVnd ?? 0n });
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
    // Keep the ledger in step with a valid webhook (the dev Succeed/Fail flow),
    // so a later reconciliation query agrees with what the webhook reported.
    if (valid) this.ledger.set(body.gatewayTxnId, { status: body.event, amountVnd });
    return { valid, event: body.event, gatewayTxnId: body.gatewayTxnId, amountVnd };
  }

  refund(input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({ supported: true, refundId: `mock_refund_${randomUUID()}_${input.gatewayTxnId.slice(-4)}` });
  }

  queryPaymentStatus(gatewayTxnId: string): Promise<PaymentStatusResult> {
    // Reflect the recorded state — `pending` unless the txn was actually paid, so
    // the reconciliation sweep never confirms a booking that was never paid (§11.2).
    const state = this.ledger.get(gatewayTxnId);
    return Promise.resolve(state ?? { status: 'pending', amountVnd: 0n });
  }
}
