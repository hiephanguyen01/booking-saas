import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const refundRepositoryPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/repositories/prisma-refund.repository.ts',
);
const paymentRepositoryPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts',
);

function normalized(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

describe('refund recovery query architecture', () => {
  it('recovers expired bookings that carry a durable cancellation refund intent', () => {
    const source = readFileSync(refundRepositoryPath, 'utf8');
    const start = source.indexOf('  async findBookingsMissingRefund(');
    const end = source.indexOf('\n  }\n}', start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(normalized(source.slice(start, end))).toContain(
      "b.status IN ('cancelled', 'refunded', 'expired') AND b.refund_due_amount > 0",
    );
  });

  it('does not repeatedly recover booking confirmation while an expired refund is pending', () => {
    const source = readFileSync(paymentRepositoryPath, 'utf8');
    const start = source.indexOf('  async findSucceededNeedingRecovery(');
    const end = source.indexOf('\n  async listTenant(', start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const recovery = normalized(source.slice(start, end));
    expect(recovery).toContain(
      "b.status = 'expired' AND b.refund_due_amount > 0",
    );
    expect(recovery).toContain(
      "AND NOT (b.status = 'expired' AND COALESCE(b.refund_due_amount, 0) > 0)",
    );
  });
});
