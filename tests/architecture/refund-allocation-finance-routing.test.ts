import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const financeModulePath = resolve(
  process.cwd(),
  'apps/api/src/modules/finance/infrastructure/http/finance.module.ts',
);
const refundBatchRepositoryPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/repositories/prisma-refund-batch.repository.ts',
);

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('refund allocation Finance routing architecture', () => {
  it('finalizes partial dispute refunds without treating security-deposit completion as settlement work', () => {
    const source = readFileSync(financeModulePath, 'utf8');
    const completedHandler = between(
      source,
      "    this.registry.register('refund.completed'",
      "\n    this.registry.register('booking.refunded'",
    );

    expect(completedHandler).toContain(
      "if (p.affectsBookingStatus === false && p.reason !== 'dispute_refund') return;",
    );
  });

  it('recovers completed partial-dispute batches while leaving security-deposit batches out', () => {
    const source = readFileSync(refundBatchRepositoryPath, 'utf8');

    expect(source).toMatch(
      /AND\s+\(rb\.affects_booking_status = true\s+OR rb\.reason = 'dispute_refund'\)/,
    );
  });
});
