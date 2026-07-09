import { describe, expect, it } from 'vitest';
import { computeRefund, hoursUntil, refundPercent, type CancellationTier } from './cancellation-policy';

const tiers: CancellationTier[] = [
  { hoursBefore: 168, refundPercent: 100 },
  { hoursBefore: 48, refundPercent: 50 },
  { hoursBefore: 0, refundPercent: 0 },
];

describe('cancellation policy', () => {
  it('picks the tier for how far ahead the cancellation is', () => {
    expect(refundPercent(tiers, 200)).toBe(100); // ≥ 168h out
    expect(refundPercent(tiers, 100)).toBe(50); // between 48 and 168
    expect(refundPercent(tiers, 10)).toBe(0); // < 48
  });

  it('gives no refund after the start (negative hours)', () => {
    expect(refundPercent(tiers, -5)).toBe(0);
  });

  it('computes the refund amount from paid × percent', () => {
    expect(computeRefund(1_000_000n, 50)).toBe(500_000n);
    expect(computeRefund(1_000_000n, 100)).toBe(1_000_000n);
    expect(computeRefund(1_000_000n, 0)).toBe(0n);
  });

  it('hoursUntil measures start − now in hours', () => {
    const now = new Date('2026-03-10T00:00:00Z');
    expect(hoursUntil(new Date('2026-03-12T00:00:00Z'), now)).toBe(48);
  });
});
