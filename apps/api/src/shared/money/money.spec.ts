import { describe, expect, it } from 'vitest';
import { formatVnd, parseVnd, percentOfBps, vnd } from './money';

describe('money (VND bigint)', () => {
  it('constructs from number/string/bigint and rejects non-integers', () => {
    expect(vnd(120_000)).toBe(120_000n);
    expect(vnd('120000')).toBe(120_000n);
    expect(vnd(120_000n)).toBe(120_000n);
    expect(() => vnd(120.5)).toThrow(TypeError);
    expect(() => vnd('120.5')).toThrow(TypeError);
  });

  it('computes commission in basis points with half-up rounding', () => {
    expect(percentOfBps(1_000_000n, 1200)).toBe(120_000n); // 12%
    expect(percentOfBps(333n, 1000)).toBe(33n); // 33.3 → 33
    expect(percentOfBps(335n, 1000)).toBe(34n); // 33.5 → 34 (half up)
    expect(percentOfBps(0n, 1200)).toBe(0n);
    expect(() => percentOfBps(100n, -1)).toThrow(TypeError);
  });

  it('splitting an amount by bps never loses a đồng when the remainder is computed', () => {
    const total = 999_999n;
    const platform = percentOfBps(total, 1200);
    const partner = total - platform;
    expect(platform + partner).toBe(total);
  });

  it('formats and parses round-trip', () => {
    const formatted = formatVnd(120_000n);
    expect(parseVnd(formatted)).toBe(120_000n);
    expect(parseVnd('120,000 VND')).toBe(120_000n);
  });
});
