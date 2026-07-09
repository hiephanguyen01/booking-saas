import { describe, expect, it } from 'vitest';
import { lateFee, overduePeriods } from './late-fee';

describe('late-return fee', () => {
  it('is zero when returned on time or early', () => {
    const due = new Date('2026-03-10T12:00:00Z');
    expect(overduePeriods(new Date('2026-03-10T12:00:00Z'), due, 'hour')).toBe(0);
    expect(overduePeriods(new Date('2026-03-10T10:00:00Z'), due, 'hour')).toBe(0);
    expect(lateFee(0, 100_000n, 2)).toBe(0n);
  });

  it('counts whole overdue units, rounding up', () => {
    const due = new Date('2026-03-10T12:00:00Z');
    expect(overduePeriods(new Date('2026-03-10T13:30:00Z'), due, 'hour')).toBe(2); // 1.5h → 2
    expect(overduePeriods(new Date('2026-03-12T00:00:00Z'), due, 'day')).toBe(2); // 1.5d → 2
  });

  it('charges rate × periods × quantity', () => {
    expect(lateFee(2, 100_000n, 3)).toBe(600_000n);
  });
});
