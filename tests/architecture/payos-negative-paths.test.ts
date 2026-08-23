import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const payosAdapterPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts',
);
const paymentRepositoryPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts',
);

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('PayOS negative-path architecture', () => {
  it('verifies the webhook signature before parsing signed payment fields', () => {
    const source = readFileSync(payosAdapterPath, 'utf8');
    const verifyWebhook = between(source, '  verifyWebhook(', '\n  refund(');

    const signatureCheck = verifyWebhook.indexOf('safeHexEqual(');
    const orderCodeParse = verifyWebhook.indexOf("parsePositiveSafeInteger(body.data?.orderCode");
    const amountParse = verifyWebhook.indexOf("parsePositiveSafeInteger(body.data?.amount");

    expect(signatureCheck).toBeGreaterThanOrEqual(0);
    expect(orderCodeParse).toBeGreaterThanOrEqual(0);
    expect(amountParse).toBeGreaterThanOrEqual(0);
    expect(signatureCheck).toBeLessThan(orderCodeParse);
    expect(signatureCheck).toBeLessThan(amountParse);
  });

  it('atomically allows only pending payments to transition to succeeded', () => {
    const source = readFileSync(paymentRepositoryPath, 'utf8');
    const markSucceeded = between(source, '  async markSucceeded(', '\n  /** Atomic guarded write');

    expect(markSucceeded).toContain("AND status = 'pending'");
    expect(markSucceeded).not.toContain("status <> 'succeeded'");
  });
});
