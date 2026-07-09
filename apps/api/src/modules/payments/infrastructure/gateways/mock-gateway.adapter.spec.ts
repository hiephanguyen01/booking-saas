import { describe, expect, it } from 'vitest';
import { MockGatewayAdapter, signMockWebhook } from './mock-gateway.adapter';

const input = {
  amountVnd: 300_000n,
  orderCode: 'o1',
  description: 'd',
  returnUrl: 'http://x/r',
  cancelUrl: 'http://x/c',
  expiresInSec: 900,
};

function webhook(gatewayTxnId: string, event: 'succeeded' | 'failed' | 'expired', amountVnd: bigint): Buffer {
  return Buffer.from(
    JSON.stringify({
      gatewayTxnId,
      event,
      amountVnd: amountVnd.toString(),
      signature: signMockWebhook(gatewayTxnId, event, amountVnd),
    }),
  );
}

describe('MockGatewayAdapter.queryPaymentStatus (§11.2)', () => {
  it('reports pending for an unknown txn (never confirms a never-paid booking)', async () => {
    const mock = new MockGatewayAdapter();
    const res = await mock.queryPaymentStatus('mock_unknown');
    expect(res.status).toBe('pending');
  });

  it('reports pending for a created-but-unpaid txn', async () => {
    const mock = new MockGatewayAdapter();
    const created = await mock.createPayment(input);
    const res = await mock.queryPaymentStatus(created.gatewayTxnId);
    expect(res).toEqual({ status: 'pending', amountVnd: 300_000n });
  });

  it('reports succeeded + the correct amount after markPaid', async () => {
    const mock = new MockGatewayAdapter();
    const created = await mock.createPayment(input);
    mock.markPaid(created.gatewayTxnId);
    const res = await mock.queryPaymentStatus(created.gatewayTxnId);
    expect(res).toEqual({ status: 'succeeded', amountVnd: 300_000n });
  });

  it('a valid succeeded webhook records paid state (dev Succeed flow)', async () => {
    const mock = new MockGatewayAdapter();
    const created = await mock.createPayment(input);
    const v = mock.verifyWebhook(webhook(created.gatewayTxnId, 'succeeded', 300_000n));
    expect(v.valid).toBe(true);
    expect(await mock.queryPaymentStatus(created.gatewayTxnId)).toEqual({ status: 'succeeded', amountVnd: 300_000n });
  });

  it('a valid failed webhook records failed state (dev Fail flow)', async () => {
    const mock = new MockGatewayAdapter();
    const created = await mock.createPayment(input);
    mock.verifyWebhook(webhook(created.gatewayTxnId, 'failed', 300_000n));
    expect((await mock.queryPaymentStatus(created.gatewayTxnId)).status).toBe('failed');
  });
});
