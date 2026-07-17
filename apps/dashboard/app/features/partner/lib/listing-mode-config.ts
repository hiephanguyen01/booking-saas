import type { BookingMode, ListingResponse } from '@booking/contracts';

/**
 * The `mode_config` round-trip for the partner listing form (§7.3/§9).
 *
 * Why this is its own module: `PATCH /partner/listings/:id` REPLACES `mode_config`
 * wholesale (update-listing.use-case), so whatever `buildModeConfig` omits is
 * DESTROYED on every save. That made it silent-data-loss territory — bundle
 * `blocks` and the inventory late-return fee (which is billed to customers,
 * §9.4) used to be wiped by simply opening the form and pressing save. Pure and
 * React-free so the round-trip is unit-testable.
 *
 * Two defences, both load-bearing:
 *  1. every documented field is represented in `DynamicState`, so it survives;
 *  2. `buildModeConfig` spreads the SAVED config first, so a key this form does
 *     not know about (a newer field, a value written by another client) is
 *     preserved rather than dropped.
 */

/** Integer VND đồng string ("12000") from a numeric input value. */
export const vnd = (v: string): string => String(Math.max(0, Math.round(Number(v) || 0)));

export const int = (v: string, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

export const num = (v: unknown, fallback = ''): string =>
  v === undefined || v === null ? fallback : String(v);

/** An optional positive-int field: blank/invalid → omit the key (never send 0). */
export const optInt = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * An optional VND field: blank → omit the key. Never coerce blank to '0':
 * `lateFeePerUnit` falls back to `basePrice` server-side when absent (§9.4), so a
 * '0' here would silently make late returns free.
 */
export const optVnd = (v: string): string | undefined => (v.trim() === '' ? undefined : vnd(v));

/** One bundle-price row: N units for a flat price (§9.1). */
export interface BlockRow {
  count: string;
  price: string;
}

/** The listing's stored `mode_config`, keyed by mode — the round-trip base. */
export type ModeConfigMap = Record<string, Record<string, unknown> | undefined>;

export interface DynamicState {
  bookingModes: BookingMode[];
  hourly: {
    basePrice: string;
    blocks: BlockRow[];
    minDuration: string;
    maxDuration: string;
    granularity: string;
    leadTimeMin: string;
  };
  daily: {
    basePricePerNight: string;
    blocks: BlockRow[];
    minNights: string;
    maxNights: string;
    checkinTime: string;
    checkoutTime: string;
    leadTimeMin: string;
  };
  inventory: {
    unit: 'hour' | 'day';
    basePrice: string;
    securityDeposit: string;
    minDuration: string;
    maxDuration: string;
    lateFeePerUnit: string;
  };
  stockQuantity: string;
  attributes: Record<string, unknown>;
}

/** Read `blocks` off a saved mode config (the count key differs per mode). */
export function readBlocks(
  config: Record<string, unknown>,
  countKey: 'hours' | 'days',
): BlockRow[] {
  const raw = config.blocks;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    if (!b || typeof b !== 'object') return [];
    const row = b as Record<string, unknown>;
    return [{ count: num(row[countKey], ''), price: num(row.price, '') }];
  });
}

/** Serialize block rows back, dropping incomplete ones. */
export function writeBlocks(
  rows: BlockRow[],
  countKey: 'hours' | 'days',
): Record<string, unknown>[] {
  return rows.flatMap((row) => {
    const count = optInt(row.count);
    if (count === undefined || row.price.trim() === '') return [];
    return [{ [countKey]: count, price: vnd(row.price) }];
  });
}

export function savedModeConfig(listing?: ListingResponse): ModeConfigMap {
  return (listing?.modeConfig ?? {}) as ModeConfigMap;
}

export function initialDynamic(listing?: ListingResponse): DynamicState {
  const mc = savedModeConfig(listing);
  const h = mc.hourly ?? {};
  const d = mc.daily ?? {};
  const inv = mc.inventory ?? {};
  return {
    bookingModes: (listing?.bookingModes ?? []) as BookingMode[],
    hourly: {
      basePrice: num(h.basePrice, '0'),
      blocks: readBlocks(h, 'hours'),
      minDuration: num(h.minDuration, '1'),
      maxDuration: num(h.maxDuration, '8'),
      granularity: num(h.granularity, '60'),
      leadTimeMin: num(h.leadTimeMin, '0'),
    },
    daily: {
      basePricePerNight: num(d.basePricePerNight, '0'),
      blocks: readBlocks(d, 'days'),
      minNights: num(d.minNights, '1'),
      maxNights: num(d.maxNights, '30'),
      checkinTime: num(d.checkinTime, '14:00'),
      checkoutTime: num(d.checkoutTime, '12:00'),
      leadTimeMin: num(d.leadTimeMin, '0'),
    },
    inventory: {
      unit: (inv.unit as 'hour' | 'day') ?? 'day',
      basePrice: num(inv.basePrice, '0'),
      securityDeposit: num(inv.securityDeposit, '0'),
      minDuration: num(inv.minDuration, ''),
      maxDuration: num(inv.maxDuration, ''),
      lateFeePerUnit: num(inv.lateFeePerUnit, ''),
    },
    stockQuantity: num(listing?.stockQuantity, '1'),
    attributes: listing?.attributes ?? {},
  };
}

/** Assemble the typed `modeConfig` the shared schema expects from the editor state. */
export function buildModeConfig(s: DynamicState, saved: ModeConfigMap): Record<string, unknown> {
  const modes = s.bookingModes;
  const modeConfig: Record<string, unknown> = {};
  if (modes.includes('hourly')) {
    modeConfig.hourly = {
      ...saved.hourly,
      basePrice: vnd(s.hourly.basePrice),
      blocks: writeBlocks(s.hourly.blocks, 'hours'),
      minDuration: int(s.hourly.minDuration, 1),
      maxDuration: int(s.hourly.maxDuration, 8),
      granularity: int(s.hourly.granularity, 60),
      leadTimeMin: int(s.hourly.leadTimeMin, 0),
    };
  }
  if (modes.includes('daily')) {
    modeConfig.daily = {
      ...saved.daily,
      basePricePerNight: vnd(s.daily.basePricePerNight),
      blocks: writeBlocks(s.daily.blocks, 'days'),
      minNights: int(s.daily.minNights, 1),
      maxNights: int(s.daily.maxNights, 30),
      checkinTime: s.daily.checkinTime,
      checkoutTime: s.daily.checkoutTime,
      leadTimeMin: int(s.daily.leadTimeMin, 0),
    };
  }
  if (modes.includes('inventory')) {
    modeConfig.inventory = {
      ...saved.inventory,
      unit: s.inventory.unit,
      basePrice: vnd(s.inventory.basePrice),
      securityDeposit: vnd(s.inventory.securityDeposit),
      minDuration: optInt(s.inventory.minDuration),
      maxDuration: optInt(s.inventory.maxDuration),
      lateFeePerUnit: optVnd(s.inventory.lateFeePerUnit),
    };
  }
  return modeConfig;
}
