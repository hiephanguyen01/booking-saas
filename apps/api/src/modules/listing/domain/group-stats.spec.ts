import { describe, expect, it } from 'vitest';
import { basePrices, computeGroupStats, isListingReady, type ListingStatsFacts } from './group-stats';

function facts(overrides: Partial<ListingStatsFacts> = {}): ListingStatsFacts {
  return {
    description: 'Phòng chụp có ánh sáng tự nhiên.',
    photos: ['https://cdn.example.com/a.jpg'],
    bookingModes: ['hourly'],
    modeConfig: { hourly: { basePrice: '300000' } },
    ...overrides,
  };
}

describe('basePrices', () => {
  it('parses the contract digit-string form', () => {
    expect(basePrices(facts())).toEqual([300000n]);
  });

  it('parses the legacy numeric form the seed writes to jsonb', () => {
    expect(basePrices(facts({ modeConfig: { hourly: { basePrice: 300000 } } }))).toEqual([300000n]);
  });

  it('keeps full precision on an amount beyond 2^53', () => {
    // Number('9007199254740993') === 9007199254740992 — BigInt must be used.
    const big = '9007199254740993';
    expect(basePrices(facts({ modeConfig: { daily: { basePricePerNight: big } } }))).toEqual([
      9007199254740993n,
    ]);
  });

  it('collects a price from every configured mode', () => {
    expect(
      basePrices(
        facts({
          modeConfig: {
            hourly: { basePrice: '300000' },
            daily: { basePricePerNight: '1800000' },
          },
        }),
      ),
    ).toEqual([300000n, 1800000n]);
  });

  it('skips malformed and non-positive amounts instead of inventing a price', () => {
    expect(
      basePrices(
        facts({
          modeConfig: {
            hourly: { basePrice: 'free' },
            daily: { basePricePerNight: '0' },
            inventory: { basePrice: 12.5 },
          },
        }),
      ),
    ).toEqual([]);
  });

  it('tolerates a junk mode config', () => {
    expect(basePrices(facts({ modeConfig: { hourly: null, daily: 'nope' } }))).toEqual([]);
  });
});

describe('isListingReady', () => {
  it('accepts a listing with a photo, a description and a price per mode', () => {
    expect(isListingReady(facts())).toBe(true);
  });

  it('rejects a listing with no photo', () => {
    expect(isListingReady(facts({ photos: [] }))).toBe(false);
  });

  it('rejects a blank description', () => {
    expect(isListingReady(facts({ description: '   ' }))).toBe(false);
  });

  it('rejects a mode with no price', () => {
    expect(isListingReady(facts({ bookingModes: ['hourly', 'daily'] }))).toBe(false);
  });

  it('rejects a listing with no booking mode at all', () => {
    expect(isListingReady(facts({ bookingModes: [] }))).toBe(false);
  });
});

describe('computeGroupStats', () => {
  it('reports an empty post', () => {
    expect(computeGroupStats([])).toEqual({
      listingCount: 0,
      readyListingCount: 0,
      priceFrom: null,
    });
  });

  it('counts items and ready items separately', () => {
    const stats = computeGroupStats([facts(), facts({ photos: [] })]);
    expect(stats.listingCount).toBe(2);
    expect(stats.readyListingCount).toBe(1);
  });

  it('takes priceFrom as the lowest price across every item, as a digit string', () => {
    const stats = computeGroupStats([
      facts({ modeConfig: { hourly: { basePrice: '500000' } } }),
      facts({ modeConfig: { hourly: { basePrice: '250000' } } }),
    ]);
    expect(stats.priceFrom).toBe('250000');
  });

  it('compares prices numerically, not lexicographically', () => {
    // '1000000' < '900000' as strings — the min must be the smaller AMOUNT.
    const stats = computeGroupStats([
      facts({ modeConfig: { hourly: { basePrice: '1000000' } } }),
      facts({ modeConfig: { hourly: { basePrice: '900000' } } }),
    ]);
    expect(stats.priceFrom).toBe('900000');
  });
});
