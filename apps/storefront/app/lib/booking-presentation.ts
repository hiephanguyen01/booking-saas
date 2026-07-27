/** Keys under a booking-mode config entry that hold its base unit price. */
const BASE_PRICE_KEYS = ['basePrice', 'basePricePerNight'] as const;

/**
 * Cheapest enabled price across booking modes and fixed packages.
 *
 * Money contracts allow canonical digit strings up to 20 digits, so comparing
 * through `Number(...)` can lose precision or return scientific notation. Keep
 * the comparison in bigint space and return the original VND đồng shape.
 */
export function minimumConfiguredPrice(modeConfig: Record<string, unknown>): string | null {
  let minimum: bigint | null = null;

  const include = (raw: unknown): void => {
    const value = toPositiveVnd(raw);
    if (value !== null && (minimum === null || value < minimum)) minimum = value;
  };

  for (const config of Object.values(modeConfig)) {
    if (!config || typeof config !== 'object') continue;
    const row = config as Record<string, unknown>;

    for (const key of BASE_PRICE_KEYS) include(row[key]);

    if (Array.isArray(row.packages)) {
      for (const item of row.packages) {
        if (!item || typeof item !== 'object') continue;
        const pkg = item as Record<string, unknown>;
        if (pkg.isActive === false) continue;
        include(pkg.price);
      }
    }
  }

  return minimum === null ? null : minimum.toString();
}

function toPositiveVnd(raw: unknown): bigint | null {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const value = BigInt(raw);
    return value > 0n ? value : null;
  }
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) {
    return BigInt(raw);
  }
  return null;
}
