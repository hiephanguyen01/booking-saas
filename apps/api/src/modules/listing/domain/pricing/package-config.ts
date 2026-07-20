import {
  modeConfigSchema,
  type BookingMode,
  type BookingSelection,
  type DailyPackage,
  type HourlyPackage,
  type ModeConfig,
  type SelectedPackage,
} from '@booking/contracts';

export class ListingModeConfigError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function activePackages(modeConfig: ModeConfig, mode: 'hourly'): HourlyPackage[];
export function activePackages(modeConfig: ModeConfig, mode: 'daily'): DailyPackage[];
export function activePackages(
  modeConfig: ModeConfig,
  mode: 'hourly' | 'daily',
): Array<HourlyPackage | DailyPackage>;
export function activePackages(
  modeConfig: ModeConfig,
  mode: 'hourly' | 'daily',
): Array<HourlyPackage | DailyPackage> {
  const packages = mode === 'hourly' ? modeConfig.hourly?.packages : modeConfig.daily?.packages;
  return [...(packages ?? [])]
    .filter((item) => item.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function findActivePackage(
  modeConfig: ModeConfig,
  mode: BookingMode,
  packageId: string | undefined,
): SelectedPackage {
  if (!packageId || (mode !== 'hourly' && mode !== 'daily')) {
    throw new ListingModeConfigError('PACKAGE_UNAVAILABLE', 'Select an available package');
  }
  const found = activePackages(modeConfig, mode).find((item) => item.id === packageId);
  if (!found) {
    throw new ListingModeConfigError('PACKAGE_UNAVAILABLE', 'The selected package is unavailable');
  }
  return { ...found, mode } as SelectedPackage;
}

/**
 * Cross-entity validation for a listing's JSON config. The shared schema owns
 * shape validation; this function applies the listing type's booking policy and
 * returns a normalized config with legacy `blocks` stripped.
 */
export function validateAndNormalizeModeConfig(input: {
  bookingSelection: BookingSelection;
  bookingModes: BookingMode[];
  modeConfig: unknown;
}): ModeConfig {
  const parsed = modeConfigSchema.safeParse(input.modeConfig);
  if (!parsed.success) {
    throw new ListingModeConfigError('INVALID_MODE_CONFIG', 'Mode configuration is invalid');
  }
  const config = parsed.data;
  const allIds: string[] = [];

  for (const mode of input.bookingModes) {
    if (mode !== 'hourly' && mode !== 'daily' && mode !== 'inventory') {
      throw new ListingModeConfigError(
        'MODE_UNSUPPORTED',
        `Configuration for booking mode "${mode}" is not supported`,
      );
    }
    if (!config[mode]) {
      throw new ListingModeConfigError(
        'MISSING_MODE_CONFIG',
        `modeConfig.${mode} is required for enabled mode "${mode}"`,
      );
    }
  }

  if (input.bookingSelection === 'fixed_packages') {
    if (input.bookingModes.some((mode) => mode !== 'hourly' && mode !== 'daily')) {
      throw new ListingModeConfigError(
        'INVALID_FIXED_PACKAGE_MODES',
        'Fixed packages only support hourly and daily booking modes',
      );
    }
    for (const mode of input.bookingModes) {
      if (mode !== 'hourly' && mode !== 'daily') continue;
      const packages = activePackages(config, mode);
      if (packages.length === 0) {
        throw new ListingModeConfigError(
          'PACKAGE_CONFIG_REQUIRED',
          `At least one active package is required for ${mode} mode`,
        );
      }
      const configuredPackages =
        mode === 'hourly' ? config.hourly?.packages : config.daily?.packages;
      allIds.push(...(configuredPackages ?? []).map((item) => item.id));
    }
  } else {
    for (const mode of input.bookingModes) {
      if (mode === 'hourly') {
        const hourly = config.hourly!;
        if (
          !hourly.basePrice ||
          hourly.minDuration === undefined ||
          hourly.maxDuration === undefined
        ) {
          throw new ListingModeConfigError(
            'FLEXIBLE_PRICE_CONFIG_REQUIRED',
            'Hourly flexible booking requires base price and min/max duration',
          );
        }
        if (hourly.packages.length > 0) {
          throw new ListingModeConfigError(
            'PACKAGE_CONFIG_NOT_ALLOWED',
            'Flexible-duration listings cannot define fixed packages',
          );
        }
      }
      if (mode === 'daily') {
        const daily = config.daily!;
        if (
          !daily.basePricePerNight ||
          daily.minNights === undefined ||
          daily.maxNights === undefined
        ) {
          throw new ListingModeConfigError(
            'FLEXIBLE_PRICE_CONFIG_REQUIRED',
            'Daily flexible booking requires base price and min/max nights',
          );
        }
        if (daily.packages.length > 0) {
          throw new ListingModeConfigError(
            'PACKAGE_CONFIG_NOT_ALLOWED',
            'Flexible-duration listings cannot define fixed packages',
          );
        }
      }
    }
  }

  if (new Set(allIds).size !== allIds.length) {
    throw new ListingModeConfigError(
      'DUPLICATE_PACKAGE_ID',
      'Package IDs must be unique across the listing',
    );
  }
  const normalized: Record<string, unknown> = {};
  if (config.hourly) {
    normalized.hourly =
      input.bookingSelection === 'fixed_packages'
        ? {
            packages: config.hourly.packages,
            granularity: config.hourly.granularity,
            leadTimeMin: config.hourly.leadTimeMin,
          }
        : { ...config.hourly, packages: [] };
  }
  if (config.daily) {
    normalized.daily =
      input.bookingSelection === 'fixed_packages'
        ? {
            packages: config.daily.packages,
            checkinTime: config.daily.checkinTime,
            checkoutTime: config.daily.checkoutTime,
            leadTimeMin: config.daily.leadTimeMin,
          }
        : { ...config.daily, packages: [] };
  }
  if (config.inventory) normalized.inventory = config.inventory;
  return modeConfigSchema.parse(normalized);
}

/** Public payloads expose active packages only. */
export function publicModeConfig(modeConfig: Record<string, unknown>): Record<string, unknown> {
  const parsed = modeConfigSchema.safeParse(modeConfig);
  if (!parsed.success) return {};
  return {
    ...(parsed.data.hourly
      ? { hourly: { ...parsed.data.hourly, packages: activePackages(parsed.data, 'hourly') } }
      : {}),
    ...(parsed.data.daily
      ? { daily: { ...parsed.data.daily, packages: activePackages(parsed.data, 'daily') } }
      : {}),
    ...(parsed.data.inventory ? { inventory: parsed.data.inventory } : {}),
  };
}
