/** Cheapest configured price across booking modes and fixed packages. */
export function minimumConfiguredPrice(modeConfig: Record<string, unknown>): string | null {
  const prices: number[] = [];

  for (const config of Object.values(modeConfig)) {
    if (!config || typeof config !== 'object') continue;
    const row = config as Record<string, unknown>;

    for (const key of ['basePrice', 'basePricePerNight']) {
      const value = Number(row[key]);
      if (Number.isFinite(value) && value > 0) prices.push(value);
    }

    if (Array.isArray(row.packages)) {
      for (const item of row.packages) {
        if (!item || typeof item !== 'object') continue;
        const value = Number((item as Record<string, unknown>).price);
        if (Number.isFinite(value) && value > 0) prices.push(value);
      }
    }
  }

  return prices.length > 0 ? String(Math.min(...prices)) : null;
}
