import { describe, expect, it } from 'vitest';
import { hasCapacity, remainingStock } from './inventory-stock';

describe('inventory stock', () => {
  it('allows a request that fits the remaining stock', () => {
    expect(hasCapacity(3, 1, 2)).toBe(true); // 1 used + 2 = 3 ≤ 3
  });

  it('rejects a request that would exceed stock (never oversell)', () => {
    expect(hasCapacity(3, 2, 2)).toBe(false); // 2 + 2 = 4 > 3
    expect(hasCapacity(3, 3, 1)).toBe(false); // sold out
  });

  it('rejects a non-positive quantity', () => {
    expect(hasCapacity(3, 0, 0)).toBe(false);
  });

  it('reports remaining stock, floored at zero', () => {
    expect(remainingStock(3, 1)).toBe(2);
    expect(remainingStock(3, 5)).toBe(0);
  });
});
