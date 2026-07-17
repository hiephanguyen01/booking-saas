import { describe, expect, it } from 'vitest';
import type { ListingResponse } from '@booking/contracts';
import { buildModeConfig, initialDynamic, savedModeConfig } from './listing-mode-config';

/**
 * `PATCH /partner/listings/:id` replaces `mode_config` wholesale, so "load the
 * form, press save, change nothing" MUST be a no-op. It was not: `blocks` was
 * hardcoded to `[]` and the inventory config emitted only three of its six keys,
 * so every save destroyed bundle pricing and the late-return fee that
 * `inventory-fulfillment.use-case` bills to customers (§9.4).
 */

/** A listing exercising every documented mode_config field across all 3 modes. */
const FULL_MODE_CONFIG = {
  hourly: {
    basePrice: '300000',
    blocks: [
      { hours: 4, price: '1000000' },
      { hours: 8, price: '1800000' },
    ],
    minDuration: 2,
    maxDuration: 10,
    granularity: 30,
    leadTimeMin: 120,
  },
  daily: {
    basePricePerNight: '1200000',
    blocks: [{ days: 7, price: '7000000' }],
    minNights: 2,
    maxNights: 14,
    checkinTime: '15:00',
    checkoutTime: '11:00',
    leadTimeMin: 1440,
  },
  inventory: {
    unit: 'day' as const,
    basePrice: '150000',
    securityDeposit: '2000000',
    minDuration: 2,
    maxDuration: 30,
    lateFeePerUnit: '50000',
  },
};

function listing(modeConfig: Record<string, unknown>): ListingResponse {
  return {
    modeConfig,
    bookingModes: ['hourly', 'daily', 'inventory'],
    stockQuantity: 5,
    attributes: {},
  } as unknown as ListingResponse;
}

/** Load the form from a listing and save it back untouched. */
function roundTrip(modeConfig: Record<string, unknown>): Record<string, unknown> {
  const l = listing(modeConfig);
  return buildModeConfig(initialDynamic(l), savedModeConfig(l));
}

describe('listing mode config round-trip', () => {
  it('preserves a full mode config when nothing is edited', () => {
    expect(roundTrip(FULL_MODE_CONFIG)).toEqual(FULL_MODE_CONFIG);
  });

  it('preserves bundle pricing blocks for hourly and daily', () => {
    const out = roundTrip(FULL_MODE_CONFIG) as typeof FULL_MODE_CONFIG;
    expect(out.hourly.blocks).toEqual([
      { hours: 4, price: '1000000' },
      { hours: 8, price: '1800000' },
    ]);
    expect(out.daily.blocks).toEqual([{ days: 7, price: '7000000' }]);
  });

  it('preserves the inventory late fee that fulfillment bills to customers', () => {
    const out = roundTrip(FULL_MODE_CONFIG) as typeof FULL_MODE_CONFIG;
    expect(out.inventory.lateFeePerUnit).toBe('50000');
    expect(out.inventory.minDuration).toBe(2);
    expect(out.inventory.maxDuration).toBe(30);
  });

  it('keeps money as digit strings, never numbers', () => {
    const out = roundTrip(FULL_MODE_CONFIG) as typeof FULL_MODE_CONFIG;
    expect(out.hourly.basePrice).toBe('300000');
    expect(typeof out.daily.blocks[0]!.price).toBe('string');
    expect(typeof out.inventory.securityDeposit).toBe('string');
  });

  it('preserves keys the form does not know about', () => {
    // A field added by a newer client must survive this form's save.
    const out = roundTrip({
      ...FULL_MODE_CONFIG,
      hourly: { ...FULL_MODE_CONFIG.hourly, futureField: 'keep-me' },
    }) as Record<string, Record<string, unknown>>;
    expect(out.hourly!.futureField).toBe('keep-me');
  });

  it('omits absent optional inventory keys rather than sending zero', () => {
    // lateFeePerUnit defaults to basePrice server-side (§9.4) — a literal '0'
    // here would silently make late returns free.
    const out = roundTrip({
      inventory: { unit: 'hour', basePrice: '80000', securityDeposit: '0' },
    }) as Record<string, Record<string, unknown>>;
    expect(out.inventory!.lateFeePerUnit).toBeUndefined();
    expect(out.inventory!.minDuration).toBeUndefined();
    expect(out.inventory!.maxDuration).toBeUndefined();
  });

  it('drops a mode config when its mode is turned off', () => {
    const l = listing(FULL_MODE_CONFIG);
    const state = initialDynamic(l);
    const out = buildModeConfig({ ...state, bookingModes: ['hourly'] }, savedModeConfig(l));
    expect(out.hourly).toBeDefined();
    expect(out.daily).toBeUndefined();
    expect(out.inventory).toBeUndefined();
  });

  it('drops incomplete block rows instead of emitting a broken block', () => {
    const l = listing(FULL_MODE_CONFIG);
    const state = initialDynamic(l);
    const out = buildModeConfig(
      {
        ...state,
        hourly: {
          ...state.hourly,
          blocks: [{ count: '4', price: '1000000' }, { count: '', price: '' }],
        },
      },
      savedModeConfig(l),
    ) as typeof FULL_MODE_CONFIG;
    expect(out.hourly.blocks).toEqual([{ hours: 4, price: '1000000' }]);
  });

  it('applies documented defaults for a listing with no saved config', () => {
    const l = listing({});
    const out = buildModeConfig(
      { ...initialDynamic(l), bookingModes: ['hourly'] },
      savedModeConfig(l),
    ) as typeof FULL_MODE_CONFIG;
    expect(out.hourly).toEqual({
      basePrice: '0',
      blocks: [],
      minDuration: 1,
      maxDuration: 8,
      granularity: 60,
      leadTimeMin: 0,
    });
  });
});
