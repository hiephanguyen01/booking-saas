import type { BookingMode, BookingSelection, ListingResponse } from '@booking/contracts';

/**
 * The `mode_config` round-trip for the partner listing form (§7.3/§9).
 *
 * Why this is its own module: `PATCH /partner/listings/:id` REPLACES `mode_config`
 * wholesale (update-listing.use-case), so whatever `buildModeConfig` omits is
 * DESTROYED on every save. That made it silent-data-loss territory — packages
 * and the inventory late-return fee (which is billed to customers,
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

/** One fixed package row in the listing editor. */
export interface PackageRow {
  id: string;
  name: string;
  description: string;
  photos: string[];
  duration: string;
  price: string;
  isActive: boolean;
  sortOrder: number;
  persisted: boolean;
}

/** The listing's stored `mode_config`, keyed by mode — the round-trip base. */
export type ModeConfigMap = Record<string, Record<string, unknown> | undefined>;

export interface DynamicState {
  bookingModes: BookingMode[];
  hourly: {
    basePrice: string;
    packages: PackageRow[];
    minDuration: string;
    maxDuration: string;
    granularity: string;
    leadTimeMin: string;
  };
  daily: {
    basePricePerNight: string;
    packages: PackageRow[];
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

/** Read fixed packages off a saved mode config. */
export function readPackages(
  config: Record<string, unknown>,
  durationKey: 'durationMinutes' | 'durationDays',
): PackageRow[] {
  const raw = config.packages;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string') return [];
    return [
      {
        id: row.id,
        name: typeof row.name === 'string' ? row.name : '',
        description: typeof row.description === 'string' ? row.description : '',
        photos: Array.isArray(row.photos)
          ? row.photos.filter((photo): photo is string => typeof photo === 'string')
          : [],
        duration: num(row[durationKey], ''),
        price: num(row.price, ''),
        isActive: row.isActive !== false,
        sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : index,
        persisted: true,
      },
    ];
  });
}

export function writePackages(
  rows: PackageRow[],
  durationKey: 'durationMinutes' | 'durationDays',
): Record<string, unknown>[] {
  return rows.flatMap((row, index) => {
    const duration = optInt(row.duration);
    if (!row.id || !row.name.trim() || duration === undefined || row.price.trim() === '') return [];
    return [
      {
        id: row.id,
        name: row.name.trim(),
        ...(row.description.trim() ? { description: row.description.trim() } : {}),
        photos: row.photos,
        [durationKey]: duration,
        price: vnd(row.price),
        isActive: row.isActive,
        sortOrder: index,
      },
    ];
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
      packages: readPackages(h, 'durationMinutes'),
      minDuration: num(h.minDuration, '1'),
      maxDuration: num(h.maxDuration, '8'),
      granularity: num(h.granularity, '60'),
      leadTimeMin: num(h.leadTimeMin, '0'),
    },
    daily: {
      basePricePerNight: num(d.basePricePerNight, '0'),
      packages: readPackages(d, 'durationDays'),
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
export function buildModeConfig(
  s: DynamicState,
  saved: ModeConfigMap,
  bookingSelection: BookingSelection,
): Record<string, unknown> {
  const modes = s.bookingModes;
  const modeConfig: Record<string, unknown> = {};
  if (modes.includes('hourly')) {
    modeConfig.hourly = {
      granularity: int(s.hourly.granularity, 60),
      leadTimeMin: int(s.hourly.leadTimeMin, 0),
      packages:
        bookingSelection === 'fixed_packages'
          ? writePackages(s.hourly.packages, 'durationMinutes')
          : [],
      ...(bookingSelection === 'flexible_duration'
        ? {
            basePrice: vnd(s.hourly.basePrice),
            minDuration: int(s.hourly.minDuration, 1),
            maxDuration: int(s.hourly.maxDuration, 8),
          }
        : {}),
    };
  }
  if (modes.includes('daily')) {
    modeConfig.daily = {
      checkinTime: s.daily.checkinTime,
      checkoutTime: s.daily.checkoutTime,
      leadTimeMin: int(s.daily.leadTimeMin, 0),
      packages:
        bookingSelection === 'fixed_packages'
          ? writePackages(s.daily.packages, 'durationDays')
          : [],
      ...(bookingSelection === 'flexible_duration'
        ? {
            basePricePerNight: vnd(s.daily.basePricePerNight),
            minNights: int(s.daily.minNights, 1),
            maxNights: int(s.daily.maxNights, 30),
          }
        : {}),
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
