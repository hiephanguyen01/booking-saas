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

function normalized(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
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

  it('uses distinct convergence rules for status-changing and partial-dispute batch recovery', () => {
    const source = readFileSync(refundBatchRepositoryPath, 'utf8');
    const recovery = normalized(
      between(
        source,
        '  async findCompletedNeedingRecovery(',
        '\n  }\n}',
      ),
    );

    expect(recovery).toContain(
      "WHERE rb.status = 'completed'::refund_batch_status AND ( ( rb.affects_booking_status = true AND ( b.status <> 'refunded'::booking_status OR bs.refund_id IS DISTINCT FROM rb.id ) ) OR ( rb.reason = 'dispute_refund' AND bs.refund_id IS DISTINCT FROM rb.id ) ) ORDER BY",
    );
  });
});
