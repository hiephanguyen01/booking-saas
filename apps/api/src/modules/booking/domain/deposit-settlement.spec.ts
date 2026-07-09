import { describe, expect, it } from 'vitest';
import { settleDeposit } from './deposit-settlement';

describe('deposit settlement', () => {
  it('refunds the full deposit when there is no damage or late fee', () => {
    expect(settleDeposit(500_000n, 0n, 0n)).toEqual({ refund: 500_000n, shortfall: 0n });
  });

  it('deducts damage + late fee from the deposit', () => {
    expect(settleDeposit(500_000n, 100_000n, 50_000n)).toEqual({ refund: 350_000n, shortfall: 0n });
  });

  it('reports a shortfall when charges exceed the deposit', () => {
    expect(settleDeposit(500_000n, 400_000n, 200_000n)).toEqual({ refund: 0n, shortfall: 100_000n });
  });
});
